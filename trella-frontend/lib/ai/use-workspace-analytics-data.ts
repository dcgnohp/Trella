import { useQuery } from "@tanstack/react-query"

import { SprintsService, BacklogService } from "@/lib/client"

/**
 * Loads the REAL analytics source (workspace sprints with tasks/counts + the
 * backlog). Reuses the exact query keys the knowledge center already uses so
 * this shares the cache instead of triggering a duplicate fetch.
 */
export function useWorkspaceAnalyticsData(workspaceId: string) {
  const sprintsQ = useQuery({
    queryKey: ["workspace-sprints", workspaceId],
    queryFn: () =>
      SprintsService.Sprints_sprintsListWorkspaceSprints({ workspaceId }),
    staleTime: 60_000,
  })
  const backlogQ = useQuery({
    queryKey: ["workspace-backlog", workspaceId],
    queryFn: () =>
      BacklogService.Backlog_backlogGetWorkspaceBacklog({ workspaceId }),
    staleTime: 60_000,
  })

  return {
    sprints: sprintsQ.data ?? [],
    backlog: backlogQ.data ?? [],
    isLoading: sprintsQ.isLoading || backlogQ.isLoading,
  }
}
