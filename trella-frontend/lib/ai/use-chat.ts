import { useCallback, useRef, useState } from "react"

import type { ExecuteActionsRequest, ExecuteActionsResponse } from "@/lib/client"

/** A single chat message. `id` + `timestamp` are set from the start so future
 *  persistence/sync (P4-B2) does not require a schema change. */
export interface ChatMessage {
  id: string
  timestamp: string
  role: "system" | "user" | "assistant" | "tool"
  content: string
}

/** Structured conversation context (design decision #6) — sent alongside
 *  messages so the backend can ground responses without a free-text blob. */
export interface ConversationContext {
  workspace?: string
  project?: string
  sprint?: string
  task?: string
  knowledge?: string
}

/**
 * Pure SSE frame parser. Splits a buffer into complete `\n\n`-terminated
 * frames and returns any incomplete trailing frame as `rest`. Each frame is
 * scanned for `event:` and `data:` lines (data lines are concatenated per the
 * SSE spec). Dependency-free so it can be unit-tested in a node env.
 */
export function parseSseChunk(buffer: string): {
  events: { event: string; data: string }[]
  rest: string
} {
  const events: { event: string; data: string }[] = []
  // The last element is the leftover (no trailing blank line yet).
  const parts = buffer.split("\n\n")
  const rest = parts.pop() ?? ""

  for (const frame of parts) {
    if (!frame.trim()) continue
    let event = "message"
    const dataLines: string[] = []
    for (const rawLine of frame.split("\n")) {
      const line = rawLine.replace(/\r$/, "")
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim()
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim())
      }
    }
    events.push({ event, data: dataLines.join("\n") })
  }

  return { events, rest }
}

/** One PROPOSED write action parked by the reasoning loop (P8). Not yet run. */
export interface ActionProposal {
  actionId: string
  toolName: string
  preview: string
  capability: string | null
}

/** All proposals for a turn, parked under a `planId` the user must approve. */
export interface PendingPlan {
  planId: string
  proposals: ActionProposal[]
}

/** Outcome of one attempted (or skipped) action returned by the execute call.
 *  Mirrors the backend `ActionResultOut` contract. */
export interface ActionResult {
  actionId: string
  toolName: string
  ok: boolean
  status: string
  summary?: string | null
  error?: string | null
}

/** Parse an `action_proposal` frame into an ActionProposal, or null if bad.
 *  ponytail: mirror the delta try/catch — ignore a malformed frame rather than
 *  kill the stream. Ceiling: field-presence checks only; upgrade path is a zod
 *  schema shared with the backend contract. */
function parseActionProposal(data: string): ActionProposal | null {
  try {
    const p = JSON.parse(data) as Partial<ActionProposal>
    if (typeof p.actionId === "string" && typeof p.toolName === "string") {
      return {
        actionId: p.actionId,
        toolName: p.toolName,
        preview: typeof p.preview === "string" ? p.preview : "",
        capability: typeof p.capability === "string" ? p.capability : null,
      }
    }
  } catch {
    /* ignore malformed action_proposal frame */
  }
  return null
}

/**
 * Pure plan folder: collects `action_proposal` frames (deduped by actionId)
 * and, on a `plan_ready` frame, returns the parked PendingPlan. Returns null
 * when no `plan_ready` arrives — proposals without a plan are not actionable.
 * Dependency-free so approval handling is unit-testable without mocking fetch.
 * The hook reuses this inside its SSE loop to stay in lockstep.
 */
export function collectPlanFromEvents(
  events: { event: string; data: string }[],
): PendingPlan | null {
  const proposals: ActionProposal[] = []
  const seen = new Set<string>()
  let planId: string | null = null

  for (const { event, data } of events) {
    if (event === "action_proposal") {
      const proposal = parseActionProposal(data)
      if (proposal && !seen.has(proposal.actionId)) {
        seen.add(proposal.actionId)
        proposals.push(proposal)
      }
    } else if (event === "plan_ready") {
      try {
        const p = JSON.parse(data) as { planId?: string }
        if (typeof p.planId === "string") planId = p.planId
      } catch {
        /* ignore malformed plan_ready frame */
      }
    }
  }

  return planId ? { planId, proposals } : null
}

/** A single progress/tool step surfaced during an in-flight turn (P7-F1). */
export interface ActivityStep {
  type: string
  label: string
  timestamp: string
}

/** Parse a `progress` frame's JSON into an ActivityStep, or null if malformed.
 *  ponytail: mirror the delta try/catch — ignore a bad frame rather than kill
 *  the stream. Ceiling: no schema validation beyond field presence; upgrade
 *  path is a zod schema shared with the backend contract. */
function parseActivityStep(data: string): ActivityStep | null {
  try {
    const p = JSON.parse(data) as Partial<ActivityStep>
    if (typeof p.type === "string" && typeof p.label === "string") {
      return { type: p.type, label: p.label, timestamp: p.timestamp ?? "" }
    }
  } catch {
    /* ignore malformed progress frame */
  }
  return null
}

/** Parse a `tool_call` frame into a synthetic ActivityStep, or null if bad. */
function parseToolCallStep(data: string): ActivityStep | null {
  try {
    const p = JSON.parse(data) as { name?: string; timestamp?: string }
    if (typeof p.name === "string") {
      return { type: "tool_call", label: p.name, timestamp: p.timestamp ?? "" }
    }
  } catch {
    /* ignore malformed tool_call frame */
  }
  return null
}

/** Parse a `tool_result` frame and return its `source` label only when the
 *  call succeeded and carries a (render-safe) source; otherwise null. */
function parseDataSource(data: string): string | null {
  try {
    const p = JSON.parse(data) as { ok?: boolean; source?: string | null }
    if (p.ok === true && typeof p.source === "string" && p.source) {
      return p.source
    }
  } catch {
    /* ignore malformed tool_result frame */
  }
  return null
}

/** A cited source document surfaced by semantic retrieval (Phase 9). Carries
 *  only non-sensitive metadata (id/title/workspace) — never chunks or scores.
 *  Extra optional fields (snippet, matched passages, rerank/semantic badges,
 *  graph refs) can be added later WITHOUT changing this contract. */
export interface Citation {
  id: string
  title: string
  workspaceId: string
}

/** Parse a `tool_result` frame's `citations` array into Citation[] (empty when
 *  absent/malformed). The backend sends snake_case `workspace_id`. */
function parseCitations(data: string): Citation[] {
  try {
    const p = JSON.parse(data) as {
      ok?: boolean
      citations?: Array<{ id?: string; title?: string; workspace_id?: string }>
    }
    if (p.ok === true && Array.isArray(p.citations)) {
      return p.citations
        .filter((c) => typeof c.id === "string" && typeof c.title === "string")
        .map((c) => ({
          id: c.id as string,
          title: c.title as string,
          workspaceId: typeof c.workspace_id === "string" ? c.workspace_id : "",
        }))
    }
  } catch {
    /* ignore malformed tool_result frame */
  }
  return []
}

/** Merge new citations into an existing list, de-duplicated by document id. */
function mergeCitations(existing: Citation[], incoming: Citation[]): Citation[] {
  const seen = new Set(existing.map((c) => c.id))
  const merged = [...existing]
  for (const c of incoming) {
    if (!seen.has(c.id)) {
      seen.add(c.id)
      merged.push(c)
    }
  }
  return merged
}

/**
 * Pure turn aggregator: folds a batch of parsed SSE events into
 * `{ text, activity, dataSources }`, appending progress/tool steps and
 * de-duplicating data sources. Dependency-free so the reasoning-path behaviour
 * is unit-testable without mocking fetch (P7-F1). The hook shares the same
 * per-frame parse helpers, so this stays in lockstep with live handling.
 */
export function aggregateTurn(
  events: { event: string; data: string }[],
  prev?: {
    text?: string
    activity?: ActivityStep[]
    dataSources?: string[]
    citations?: Citation[]
  },
): {
  text: string
  activity: ActivityStep[]
  dataSources: string[]
  citations: Citation[]
} {
  let text = prev?.text ?? ""
  const activity = [...(prev?.activity ?? [])]
  const dataSources = [...(prev?.dataSources ?? [])]
  let citations = [...(prev?.citations ?? [])]

  for (const { event, data } of events) {
    if (event === "delta") {
      try {
        const parsed = JSON.parse(data) as { text?: string }
        if (parsed.text) text += parsed.text
      } catch {
        /* ignore malformed delta frame */
      }
    } else if (event === "progress") {
      const step = parseActivityStep(data)
      if (step) activity.push(step)
    } else if (event === "tool_call") {
      const step = parseToolCallStep(data)
      if (step) activity.push(step)
    } else if (event === "tool_result") {
      const source = parseDataSource(data)
      if (source && !dataSources.includes(source)) dataSources.push(source)
      citations = mergeCitations(citations, parseCitations(data))
    }
  }

  return { text, activity, dataSources, citations }
}

function newMessage(
  role: ChatMessage["role"],
  content: string,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    role,
    content,
  }
}

/** Optional scope ids (camelCase) forwarded to the backend to enable tool
 *  scoping / session-memory reuse. Only defined keys are sent. */
export interface ChatScope {
  workspaceId?: string
  projectId?: string
  sprintId?: string
  taskId?: string
}

export interface UseChatResult {
  messages: ChatMessage[]
  send: (text: string, context?: ConversationContext, scope?: ChatScope) => Promise<void>
  stop: () => void
  isStreaming: boolean
  error: string | null
  clear: () => void
  /** Ordered progress steps for the current in-flight turn; reset per send/clear. */
  activity: ActivityStep[]
  /** De-duplicated data-source labels from successful tool_result frames. */
  dataSources: string[]
  /** De-duplicated document citations from semantic retrieval this turn. */
  citations: Citation[]
  /** Proposed writes parked for approval this turn, or null. Reset per send/clear. */
  pendingPlan: PendingPlan | null
  /** Outcomes of the last executed plan; set after executeActions resolves. */
  actionResults: ActionResult[]
  /** True while an approve/execute request is in flight. */
  isExecuting: boolean
  /** Approve + execute proposals of the pending plan, then clear it. */
  executeActions: (opts: {
    approvedActionIds?: string[]
    approveAll?: boolean
  }) => Promise<void>
  /** Reject the pending plan locally (no execution). */
  dismissPlan: () => void
}

/**
 * Chat hook: manages message state and streams assistant replies from
 * `POST /api/ai/chat` (SSE named events: start/delta/usage/error/done).
 * Cancellation ("Stop generating", decision #8) via an AbortController.
 */
export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityStep[]>([])
  const [dataSources, setDataSources] = useState<string[]>([])
  const [citations, setCitations] = useState<Citation[]>([])
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
  const [actionResults, setActionResults] = useState<ActionResult[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // The workspaceId of the most recent send, reused by executeActions so the
  // backend runs the plan in the same scope the turn was reasoned in.
  const lastWorkspaceIdRef = useRef<string | undefined>(undefined)
  // Stable per hook instance so the backend can reuse session memory across
  // sends within this conversation.
  const conversationIdRef = useRef<string>(crypto.randomUUID())

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setActivity([])
    setDataSources([])
    setCitations([])
    setPendingPlan(null)
    setActionResults([])
  }, [])

  const dismissPlan = useCallback(() => {
    setPendingPlan(null)
  }, [])

  const send = useCallback(
    async (text: string, context?: ConversationContext, scope?: ChatScope) => {
      setError(null)
      setActivity([])
      setDataSources([])
      setCitations([])
      setPendingPlan(null)
      setActionResults([])
      lastWorkspaceIdRef.current = scope?.workspaceId

      const userMsg = newMessage("user", text)
      const assistantMsg = newMessage("assistant", "")
      // Snapshot the outbound history (excludes the empty assistant placeholder).
      const outbound = [...messages, userMsg]
      setMessages([...outbound, assistantMsg])

      const controller = new AbortController()
      abortRef.current = controller
      setIsStreaming(true)

      const appendToAssistant = (chunk: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: m.content + chunk }
              : m,
          ),
        )
      }

      try {
        // Include only defined scope id keys so the backend sees clean input.
        const scopeIds = Object.fromEntries(
          Object.entries(scope ?? {}).filter(([, v]) => v != null),
        )

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: outbound,
            context,
            conversationId: conversationIdRef.current,
            ...scopeIds,
          }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          throw new Error(`Chat request failed (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        // Proposals accumulate across reads (deduped by actionId) until a
        // `plan_ready` frame parks them as the pendingPlan for approval.
        const proposals: ActionProposal[] = []
        const seenProposals = new Set<string>()

        // Reads until the stream ends, a `done`/`error` event arrives, or abort.
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { events, rest } = parseSseChunk(buffer)
          buffer = rest

          let finished = false
          for (const { event, data } of events) {
            if (event === "delta") {
              try {
                const parsed = JSON.parse(data) as { text?: string }
                if (parsed.text) appendToAssistant(parsed.text)
              } catch {
                // ponytail: ignore malformed delta frame rather than aborting
                // the whole stream — a dropped token beats a dead conversation.
              }
            } else if (event === "error") {
              let message = "Chat stream error"
              try {
                const parsed = JSON.parse(data) as { message?: string }
                if (parsed.message) message = parsed.message
              } catch {
                /* keep default message */
              }
              setError(message)
              finished = true
              break
            } else if (event === "done") {
              finished = true
              break
            } else if (event === "progress") {
              const step = parseActivityStep(data)
              if (step) setActivity((prev) => [...prev, step])
            } else if (event === "tool_call") {
              const step = parseToolCallStep(data)
              if (step) setActivity((prev) => [...prev, step])
            } else if (event === "tool_result") {
              const source = parseDataSource(data)
              if (source) {
                setDataSources((prev) =>
                  prev.includes(source) ? prev : [...prev, source],
                )
              }
              const incoming = parseCitations(data)
              if (incoming.length > 0) {
                setCitations((prev) => mergeCitations(prev, incoming))
              }
            } else if (event === "action_proposal") {
              const proposal = parseActionProposal(data)
              if (proposal && !seenProposals.has(proposal.actionId)) {
                seenProposals.add(proposal.actionId)
                proposals.push(proposal)
              }
            } else if (event === "plan_ready") {
              try {
                const p = JSON.parse(data) as { planId?: string }
                if (typeof p.planId === "string") {
                  setPendingPlan({ planId: p.planId, proposals: [...proposals] })
                }
              } catch {
                /* ignore malformed plan_ready frame */
              }
            }
            // Unknown events are ignored — forward-compatible with future frames.
          }
          if (finished) {
            await reader.cancel().catch(() => {})
            break
          }
        }
      } catch (err) {
        // An abort is a user action ("Stop generating"), not an error.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Chat stream error")
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages],
  )

  const executeActions = useCallback(
    async (opts: { approvedActionIds?: string[]; approveAll?: boolean }) => {
      if (!pendingPlan) return

      setError(null)
      setIsExecuting(true)
      try {
        // ponytail: reuse the existing fetch + /api/v1 proxy pattern (see
        // use-chat send / step-invite) so the httpOnly cookie is turned into a
        // Bearer by the catch-all proxy. We borrow the generated request/response
        // types for safety rather than the axios SDK method, keeping one transport.
        const body: ExecuteActionsRequest = {
          planId: pendingPlan.planId,
          ...(opts.approveAll ? { approveAll: true } : {}),
          ...(opts.approvedActionIds ? { approvedActionIds: opts.approvedActionIds } : {}),
          ...(lastWorkspaceIdRef.current
            ? { workspaceId: lastWorkspaceIdRef.current }
            : {}),
        }

        const res = await fetch("/api/v1/ai/actions/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          throw new Error(`Execute request failed (${res.status})`)
        }

        const json = (await res.json()) as ExecuteActionsResponse
        setActionResults(json.results ?? [])
        setPendingPlan(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to execute actions")
      } finally {
        setIsExecuting(false)
      }
    },
    [pendingPlan],
  )

  return {
    messages,
    send,
    stop,
    isStreaming,
    error,
    clear,
    activity,
    dataSources,
    citations,
    pendingPlan,
    actionResults,
    isExecuting,
    executeActions,
    dismissPlan,
  }
}
