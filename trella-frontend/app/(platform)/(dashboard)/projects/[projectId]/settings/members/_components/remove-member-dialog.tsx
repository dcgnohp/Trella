"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { ProjectMembersService } from "@/lib/client";
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

import { apiErrorMessage } from "./project-roles";

interface RemoveMemberDialogProps {
  projectId: string;
  userId: string;
  memberLabel: string;
  disabled?: boolean;
}

/**
 * Confirmation dialog gating the `DELETE .../members/{user_id}` call (Req 12.6).
 */
export const RemoveMemberDialog = ({
  projectId,
  userId,
  memberLabel,
  disabled,
}: RemoveMemberDialogProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const removeMember = useMutation({
    mutationFn: () =>
      ProjectMembersService.ProjectMembers_projectMembersRemoveMember({
        projectId,
        userId,
      }),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectMembers(projectId),
      });
      setOpen(false);
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Failed to remove member"));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !removeMember.isPending && setOpen(next)}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`Remove ${memberLabel}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove member</DialogTitle>
          <DialogDescription>
            Remove{" "}
            <span className="font-medium text-foreground">{memberLabel}</span>{" "}
            from this project? They will lose access to its boards and tasks.
            This does not remove them from the workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={removeMember.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => removeMember.mutate()}
            disabled={removeMember.isPending}
          >
            {removeMember.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
