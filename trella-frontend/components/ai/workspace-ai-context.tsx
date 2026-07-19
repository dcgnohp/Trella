'use client';
import { pickActiveSprint } from '@/lib/ai/analytics-source';
import { useContributeConversationContext } from '@/lib/ai/conversation-context';
import { useWorkspaceAnalyticsData } from '@/lib/ai/use-workspace-analytics-data';

/**
 * Headless: contributes the workspace's active sprint + its tasks to the AI
 * chat ConversationContext so the assistant can answer sprint/task questions
 * from any tab. Renders nothing. Payload-mode (reuses already-fetched data).
 */
export function WorkspaceAiContext({ workspaceId }: { workspaceId: string }) {
  const { sprints, backlog } = useWorkspaceAnalyticsData(workspaceId);
  const active = pickActiveSprint(sprints);
  // Reuse the project id already present on the loaded sprints/backlog so the AI
  // can call project/sprint/task tools without the page fetching anything new.
  const projectId =
    active?.projectId ?? sprints[0]?.projectId ?? backlog[0]?.projectId ?? undefined;
  const activeTasks = active?.tasks ?? [];
  // Include backlog so "how many tasks in the backlog" is answerable too.
  const tasks = [
    ...activeTasks.map((t) => ({ title: t.title, status: t.customStatus?.name ?? null })),
    ...backlog.map((t) => ({ title: t.title, status: t.customStatus?.name ?? 'Backlog' })),
  ];
  useContributeConversationContext({
    ids: { workspaceId, projectId, sprintId: active?.id },
    sprint: active
      ? {
          name: active.name,
          goal: active.goal,
          status: active.status,
          startDate: active.startDate,
          endDate: active.endDate,
        }
      : undefined,
    tasks,
  });
  return null;
}
