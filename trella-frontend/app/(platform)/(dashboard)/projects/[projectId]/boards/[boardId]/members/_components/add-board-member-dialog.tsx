"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import {
  BoardMembersService,
  ProjectMembersService,
  type BoardMemberPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  BOARD_ROLES,
  BOARD_ROLE_LABELS,
  apiErrorMessage,
  type BoardRole,
} from "./board-roles";

interface AddBoardMemberDialogProps {
  projectId: string;
  boardId: string;
  existingUserIds: Set<string>;
}

export const AddBoardMemberDialog = ({
  projectId,
  boardId,
  existingUserIds,
}: AddBoardMemberDialogProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<BoardRole>("BOARD_MEMBER");

  const projectMembersQuery = useQuery({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () =>
      ProjectMembersService.ProjectMembers_projectMembersListMembers({ projectId }),
    enabled: open,
    staleTime: 30_000,
  });

  const candidates = useMemo(() => {
    return (projectMembersQuery.data ?? []).filter(
      (m) => m.status === "ACTIVE" && !existingUserIds.has(m.userId),
    );
  }, [projectMembersQuery.data, existingUserIds]);

  const reset = () => {
    setSelectedUserId("");
    setRole("BOARD_MEMBER");
  };

  const addMember = useMutation({
    mutationFn: () =>
      BoardMembersService.BoardMembers_boardMembersAddMember({
        boardId,
        requestBody: { userId: selectedUserId, role },
      }),
    onSuccess: (newMember: BoardMemberPublic) => {
      toast.success("Invitation sent");
      queryClient.invalidateQueries({ queryKey: queryKeys.boardMembers(boardId) });
      setOpen(false);
      reset();
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Failed to add member")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add board member</DialogTitle>
          <DialogDescription>
            Invite an active project member to this board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Project member</Label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              disabled={addMember.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a member…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {projectMembersQuery.isLoading
                      ? "Loading…"
                      : "No eligible members"}
                  </div>
                ) : (
                  candidates.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.fullName?.trim() || m.email}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Board role</Label>
            <Select
              value={role}
              onValueChange={(next) => setRole(next as BoardRole)}
              disabled={addMember.isPending}
            >
              <SelectTrigger>
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
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={addMember.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => addMember.mutate()}
            disabled={!selectedUserId || addMember.isPending}
          >
            {addMember.isPending ? "Adding…" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
