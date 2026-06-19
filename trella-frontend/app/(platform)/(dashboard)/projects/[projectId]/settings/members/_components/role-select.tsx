"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ProjectMembersService, type ProjectMemberPublic } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  PROJECT_ROLES,
  PROJECT_ROLE_LABELS,
  apiErrorMessage,
  type ProjectRole,
} from "./project-roles";

interface RoleSelectProps {
  projectId: string;
  userId: string;
  role: string;
  disabled?: boolean;
}

const QUERY_KEY = (projectId: string) => queryKeys.projectMembers(projectId);

/**
 * Per-row project-role `<Select>` (Req 12.3). Changing the value calls
 * `PATCH .../members/{user_id}` with optimistic cache update + rollback.
 */
export const RoleSelect = ({
  projectId,
  userId,
  role,
  disabled,
}: RoleSelectProps) => {
  const queryClient = useQueryClient();

  const changeRole = useMutation({
    mutationFn: (projectRole: ProjectRole) =>
      ProjectMembersService.ProjectMembers_projectMembersChangeRole({
        projectId,
        userId,
        requestBody: { projectRole },
      }),
    onMutate: async (projectRole: ProjectRole) => {
      const key = QUERY_KEY(projectId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectMemberPublic[]>(key);
      queryClient.setQueryData<ProjectMemberPublic[]>(key, (current) =>
        current?.map((member) =>
          member.userId === userId ? { ...member, projectRole } : member,
        ),
      );
      return { previous };
    },
    onError: (error: unknown, _projectRole, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY(projectId), context.previous);
      }
      toast.error(apiErrorMessage(error, "Failed to update role"));
    },
    onSuccess: () => {
      toast.success("Role updated");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(projectId) });
    },
  });

  return (
    <Select
      value={role}
      onValueChange={(next) => changeRole.mutate(next as ProjectRole)}
      disabled={disabled || changeRole.isPending}
    >
      <SelectTrigger className="h-9 w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_ROLES.map((value) => (
          <SelectItem key={value} value={value}>
            {PROJECT_ROLE_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
