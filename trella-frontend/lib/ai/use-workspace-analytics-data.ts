import { useQuery } from "@tanstack/react-query"

import { SprintsService } from "@/lib/client"

async function fetchWorkspaceAllTasks(workspaceId: string) {
  const res = await fetch(`/api/v1/workspaces/${workspaceId}/tasks`, { cache: "no-store" });
  if (!res.ok) {
    const fb = await fetch(`/api/v1/workspaces/${workspaceId}/backlog`, { cache: "no-store" });
    if (!fb.ok) return [];
    return fb.json();
  }
  return res.json();
}

/**
 * Loads the REAL analytics source (workspace sprints with tasks/counts + ALL
 * workspace tasks including sprint tasks & backlog tasks).
 */
export function useWorkspaceAnalyticsData(workspaceId: string) {
  const sprintsQ = useQuery({
    queryKey: ["workspace-sprints", workspaceId],
    queryFn: () =>
      SprintsService.Sprints_sprintsListWorkspaceSprints({ workspaceId }),
    staleTime: 60_000,
  })
  const tasksQ = useQuery({
    queryKey: ["workspace-all-tasks", workspaceId],
    queryFn: () => fetchWorkspaceAllTasks(workspaceId),
    staleTime: 30_000,
  })

  return {
    sprints: sprintsQ.data ?? [],
    backlog: tasksQ.data ?? [],
    allTasks: tasksQ.data ?? [],
    isLoading: sprintsQ.isLoading || tasksQ.isLoading,
  }
}
