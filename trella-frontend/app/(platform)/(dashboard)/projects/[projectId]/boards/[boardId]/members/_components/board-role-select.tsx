"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { BoardMembersService, type BoardMemberPublic } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { BOARD_ROLES, BOARD_ROLE_LABELS, apiErrorMessage, type BoardRole } from "./board-roles";

interface BoardRoleSelectProps {
  boardId: string;
  userId: string;
  role: string;
  disabled?: boolean;
}

export const BoardRoleSelect = ({
  boardId,
  userId,
  role,
  disabled,
}: BoardRoleSelectProps) => {
  const queryClient = useQueryClient();
  const key = queryKeys.boardMembers(boardId);

  const changeRole = useMutation({
    mutationFn: (newRole: BoardRole) =>
      BoardMembersService.BoardMembers_boardMembersChangeRole({
        boardId,
        userId,
        requestBody: { role: newRole },
      }),
    onMutate: async (newRole: BoardRole) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardMemberPublic[]>(key);
      queryClient.setQueryData<BoardMemberPublic[]>(key, (current) =>
        current?.map((m) => (m.userId === userId ? { ...m, role: newRole } : m)),
      );
      return { previous };
    },
    onError: (error: unknown, _role, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(apiErrorMessage(error, "Failed to update role"));
    },
    onSuccess: () => toast.success("Role updated"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return (
    <Select
      value={role}
      onValueChange={(next) => changeRole.mutate(next as BoardRole)}
      disabled={disabled || changeRole.isPending}
    >
      <SelectTrigger className="h-9 w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BOARD_ROLES.map((value) => (
          <SelectItem key={value} value={value}>
            {BOARD_ROLE_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
