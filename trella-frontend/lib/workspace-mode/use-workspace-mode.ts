import { useQuery } from "@tanstack/react-query";

/** Single source of truth for a workspace's KANBAN/SCRUM mode, shared across screens. */
export function useWorkspaceMode(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace-mode", workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}`, { cache: "no-store" });
      if (!res.ok) return { mode: "KANBAN" };
      return res.json() as Promise<{ mode: string }>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
