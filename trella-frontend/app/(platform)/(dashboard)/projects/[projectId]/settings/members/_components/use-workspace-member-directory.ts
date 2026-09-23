"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { ProjectsService, WorkspaceMembersService } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";

export interface WorkspaceMemberCandidate {
  userId: string;
  fullName: string | null;
  email: string;
  avatarUrl?: string | null;
}

export interface WorkspaceMemberDirectory {
  candidates: WorkspaceMemberCandidate[];
  available: boolean;
  isLoading: boolean;
}

export function useWorkspaceMemberDirectory(
  projectId: string,
  excludeUserIds: Set<string>,
): WorkspaceMemberDirectory {
  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => ProjectsService.Projects_projectsGetProject({ projectId }),
    staleTime: 60_000,
  });

  const workspaceId = projectQuery.data?.workspaceId;

  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId ?? ""),
    queryFn: () =>
      WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({
        workspaceId: workspaceId!,
      }),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const candidates = useMemo<WorkspaceMemberCandidate[]>(() => {
    return (membersQuery.data ?? [])
      .filter((m) => !excludeUserIds.has(m.userId))
      .map((m) => ({
        userId: m.userId,
        fullName: m.fullName ?? null,
        email: m.email,
      }));
  }, [membersQuery.data, excludeUserIds]);

  const isLoading = projectQuery.isLoading || membersQuery.isLoading;

  return {
    candidates,
    available: !!workspaceId && membersQuery.isSuccess,
    isLoading,
  };
}
