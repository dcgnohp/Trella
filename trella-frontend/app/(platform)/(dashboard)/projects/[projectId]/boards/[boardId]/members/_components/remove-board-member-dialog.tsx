"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { BoardMembersService } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { apiErrorMessage } from "./board-roles";

interface RemoveBoardMemberDialogProps {
  boardId: string;
  userId: string;
  memberLabel: string;
  disabled?: boolean;
}

export const RemoveBoardMemberDialog = ({
  boardId,
  userId,
  memberLabel,
  disabled,
}: RemoveBoardMemberDialogProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    mutationFn: () =>
      BoardMembersService.BoardMembers_boardMembersRemoveMember({ boardId, userId }),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: queryKeys.boardMembers(boardId) });
      setOpen(false);
    },
    onError: (error: unknown) =>
      toast.error(apiErrorMessage(error, "Failed to remove member")),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !remove.isPending && setOpen(next)}>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={`Remove ${memberLabel}`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove board member</DialogTitle>
          <DialogDescription>
            Remove{" "}
            <span className="font-medium text-foreground">{memberLabel}</span>{" "}
            from this board? They will lose access to board tasks.
            This does not remove them from the project or workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
