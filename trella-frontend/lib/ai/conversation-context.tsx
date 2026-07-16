'use client';

/**
 * Frontend ConversationContextBuilder (Phase 4 completion — context wiring).
 *
 * Bridges "the page the user is currently viewing" to the AI chat, staying
 * fully payload-mode: pages CONTRIBUTE data they have ALREADY loaded (no new
 * API calls, no DB access, no tool calling, no RAG); the builder assembles a
 * flat {@link ConversationContext} (the wire contract in `use-chat.ts`); the
 * `AiChatPanel` CONSUMES it and passes it to `send(message, context)`.
 *
 *   Current Page → useContributeConversationContext(...)
 *        → ConversationContextProvider (registry)
 *        → buildConversationContext() → ConversationContext
 *        → AiChatPanel → send(message, context)
 *
 * The chat panel never learns HOW context is collected — it only calls
 * `useConversationContext()`. New sources (Tool Calling, RAG, Workspace/
 * Knowledge providers) plug in later by adding fields to
 * {@link ContextContribution} + a formatter branch, without touching the UI.
 */

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ConversationContext } from '@/lib/ai/use-chat';

// ponytail: char caps keep the prompt small and cheap. Upgrade path is a real
// tokenizer + RAG so long content isn't silently trimmed (ceiling: naive slice).
const MAX_DESCRIPTION_CHARS = 600;
const MAX_KNOWLEDGE_CHARS = 1500;
const MAX_TASK_LIST = 20;

/**
 * Structured pieces a page can contribute. Each is optional; the builder folds
 * all contributions together and formats the present ones into the flat
 * {@link ConversationContext} string sections. Keep this the ONLY place that
 * grows when new context sources are added.
 */
export interface ContextContribution {
  workspace?: { name?: string | null; mode?: string | null };
  /** A board belongs to a project; folded into the `project` wire section. */
  board?: { title?: string | null; columns?: string[] };
  sprint?: {
    name?: string | null;
    goal?: string | null;
    status?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  };
  /** The task currently open in the detail drawer. */
  task?: {
    title?: string | null;
    issueKey?: string | null;
    status?: string | null;
    priority?: string | null;
    storyPoint?: number | null;
    description?: string | null;
  };
  /** Lightweight board task overview (trimmed) for board-level questions. */
  tasks?: { title: string; status?: string | null }[];
  knowledge?: { title?: string | null; summary?: string | null };
}

function trim(text: string, max: number): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

/** Merge contributions field-by-field (later non-empty wins) into one blob. */
function mergeContributions(
  contributions: ContextContribution[],
): ContextContribution {
  const merged: ContextContribution = {};
  for (const c of contributions) {
    if (c.workspace) merged.workspace = { ...merged.workspace, ...c.workspace };
    if (c.board) merged.board = { ...merged.board, ...c.board };
    if (c.sprint) merged.sprint = { ...merged.sprint, ...c.sprint };
    if (c.task) merged.task = { ...merged.task, ...c.task };
    if (c.tasks && c.tasks.length) merged.tasks = c.tasks;
    if (c.knowledge) merged.knowledge = { ...merged.knowledge, ...c.knowledge };
  }
  return merged;
}

/**
 * Pure builder: structured contributions → flat {@link ConversationContext}.
 * Exported for unit testing. Empty sections are omitted so the backend's
 * `exclude_none` drops them and the prompt stays lean.
 */
export function buildConversationContext(
  contributions: ContextContribution[],
): ConversationContext {
  const m = mergeContributions(contributions);
  const ctx: ConversationContext = {};

  if (m.workspace?.name || m.workspace?.mode) {
    const parts: string[] = [];
    if (m.workspace.name) parts.push(`Name: ${m.workspace.name}`);
    if (m.workspace.mode) parts.push(`Mode: ${m.workspace.mode}`);
    ctx.workspace = parts.join('\n');
  }

  // Board (folded into `project`) + a trimmed task overview.
  const projectLines: string[] = [];
  if (m.board?.title) projectLines.push(`Board: ${m.board.title}`);
  if (m.board?.columns?.length) {
    projectLines.push(`Columns: ${m.board.columns.join(', ')}`);
  }
  if (m.tasks?.length) {
    const shown = m.tasks.slice(0, MAX_TASK_LIST);
    const list = shown
      .map((t) => `- ${t.title}${t.status ? ` (${t.status})` : ''}`)
      .join('\n');
    const more = m.tasks.length > shown.length
      ? `\n…and ${m.tasks.length - shown.length} more`
      : '';
    projectLines.push(`Tasks (${m.tasks.length}):\n${list}${more}`);
  }
  if (projectLines.length) ctx.project = projectLines.join('\n');

  if (m.sprint && (m.sprint.name || m.sprint.goal)) {
    const parts: string[] = [];
    if (m.sprint.name) parts.push(`Name: ${m.sprint.name}`);
    if (m.sprint.status) parts.push(`Status: ${m.sprint.status}`);
    if (m.sprint.goal) parts.push(`Goal: ${m.sprint.goal}`);
    if (m.sprint.startDate || m.sprint.endDate) {
      parts.push(`Dates: ${m.sprint.startDate ?? '?'} → ${m.sprint.endDate ?? '?'}`);
    }
    ctx.sprint = parts.join('\n');
  }

  if (m.task?.title) {
    const parts: string[] = [];
    const key = m.task.issueKey ? `#${m.task.issueKey}: ` : '';
    parts.push(`Title: ${key}${m.task.title}`);
    if (m.task.status) parts.push(`Status: ${m.task.status}`);
    if (m.task.priority) parts.push(`Priority: ${m.task.priority}`);
    if (m.task.storyPoint != null) parts.push(`Story points: ${m.task.storyPoint}`);
    if (m.task.description) {
      parts.push(`Description: ${trim(m.task.description, MAX_DESCRIPTION_CHARS)}`);
    }
    ctx.task = parts.join('\n');
  }

  if (m.knowledge?.title || m.knowledge?.summary) {
    const parts: string[] = [];
    if (m.knowledge.title) parts.push(`Title: ${m.knowledge.title}`);
    if (m.knowledge.summary) {
      parts.push(`Content: ${trim(m.knowledge.summary, MAX_KNOWLEDGE_CHARS)}`);
    }
    ctx.knowledge = parts.join('\n');
  }

  return ctx;
}

interface RegistryDispatch {
  register: (id: string, contribution: ContextContribution) => void;
  unregister: (id: string) => void;
}

// Split state from dispatch: dispatch is created once and NEVER changes
// identity, so contributor effects don't re-run when the registry updates.
// Coupling them (one context object holding both) caused an update loop —
// registry change → context identity change → every contributor's effect
// re-ran (unregister→register) → registry change → … → max update depth, and
// the registry got stuck empty (no context reached the backend).
const RegistryStateContext = createContext<Record<string, ContextContribution>>({});
const RegistryDispatchContext = createContext<RegistryDispatch | null>(null);

/** Wraps the page subtree (contributors) AND the AiChatPanel (consumer). */
export function ConversationContextProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<Record<string, ContextContribution>>({});

  // Stable for the provider's lifetime — the key to avoiding the update loop.
  const dispatch = useMemo<RegistryDispatch>(
    () => ({
      register(id, contribution) {
        setRegistry((prev) =>
          JSON.stringify(prev[id]) === JSON.stringify(contribution)
            ? prev
            : { ...prev, [id]: contribution },
        );
      },
      unregister(id) {
        setRegistry((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      },
    }),
    [],
  );

  return (
    <RegistryDispatchContext.Provider value={dispatch}>
      <RegistryStateContext.Provider value={registry}>
        {children}
      </RegistryStateContext.Provider>
    </RegistryDispatchContext.Provider>
  );
}

/**
 * Contributor hook: a page/component pushes its ALREADY-LOADED data up. Safe to
 * call with an empty contribution (all fields undefined) — nothing is added.
 * Re-registers only when the contribution content actually changes.
 */
export function useContributeConversationContext(
  contribution: ContextContribution,
): void {
  const dispatch = useContext(RegistryDispatchContext);
  const id = useId();
  // Serialise so the effect re-runs only on real content changes (not identity).
  const key = JSON.stringify(contribution);

  useEffect(() => {
    if (!dispatch) return;
    dispatch.register(id, contribution);
    return () => dispatch.unregister(id);
    // `key` captures `contribution`'s content; `dispatch` is stable for life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, id, key]);
}

/**
 * Consumer hook (AiChatPanel): the assembled ConversationContext, or
 * `undefined` when nothing is available so `send()` omits the field.
 */
export function useConversationContext(): ConversationContext | undefined {
  const registry = useContext(RegistryStateContext);
  return useMemo(() => {
    const contributions = Object.values(registry);
    if (!contributions.length) return undefined;
    const built = buildConversationContext(contributions);
    return Object.keys(built).length ? built : undefined;
  }, [registry]);
}
