"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { ApiError, ProjectMembersService } from "@/lib/client";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { WorkspaceMemberCombobox } from "./workspace-member-combobox";
import {
  useWorkspaceMemberDirectory,
  type WorkspaceMemberCandidate,
} from "./use-workspace-member-directory";

interface AddMemberDialogProps {
  projectId: string;
  /** userIds already in the project (PENDING or ACTIVE), excluded from search. */
  existingUserIds: Set<string>;
}

/**
 * "+ Add Member" dialog (Req 12.4, 12.5).
 *
 * Primary path: autocomplete over workspace members not yet in the project.
 * Fallback path (until the workspace-member listing endpoint is generated):
 * enter the invitee's user id directly. Either way submit drives
 * `POST /api/v1/projects/{id}/members`; a 400 ("User must be an active
 * workspace member…") shows a toast suggesting a workspace invite first.
 */
export const AddMemberDialog = ({
  projectId,
  existingUserIds,
}: AddMemberDialogProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<WorkspaceMemberCandidate | null>(
    null,
  );
  const [manualUserId, setManualUserId] = useState("");
  const [role, setRole] = useState<ProjectRole>("PROJECT_MEMBER");

  const directory = useWorkspaceMemberDirectory(projectId, existingUserIds);

  const resetForm = () => {
    setSelected(null);
    setManualUserId("");
    setRole("PROJECT_MEMBER");
  };

  const addMember = useMutation({
    mutationFn: (userId: string) =>
      ProjectMembersService.ProjectMembers_projectMembersAddMember({
        projectId,
        requestBody: { userId, projectRole: role },
      }),
    onSuccess: () => {
      toast.success("Invitation sent");
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectMembers(projectId),
      });
      setOpen(false);
      resetForm();
    },
    onError: (error: unknown) => {
      // Req 12.5: a 400 means the user is not an active workspace member yet —
      // suggest inviting them to the workspace first.
      if (error instanceof ApiError && error.status === 400) {
        toast.error("Can't add this user to the project", {
          description:
            "They must be an active workspace member first. Invite them to the workspace, then add them here.",
        });
        return;
      }
      toast.error(apiErrorMessage(error, "Failed to add member"));
    },
  });

  const chosenUserId = directory.available
    ? (selected?.userId ?? "")
    : manualUserId.trim();

  const handleSubmit = () => {
    if (!chosenUserId) {
      return;
    }
    addMember.mutate(chosenUserId);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          resetForm();
        }
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
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Add an existing workspace member to this project and pick their
            role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Workspace member</Label>
            {directory.available ? (
              <WorkspaceMemberCombobox
                candidates={directory.candidates}
                value={selected}
                onSelect={setSelected}
                disabled={addMember.isPending}
              />
            ) : (
              <>
                <Input
                  value={manualUserId}
                  onChange={(event) => setManualUserId(event.target.value)}
                  placeholder="Workspace member user ID"
                  disabled={addMember.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the user ID of an active workspace member to invite them
                  to this project.
                </p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Project role</Label>
            <Select
              value={role}
              onValueChange={(next) => setRole(next as ProjectRole)}
              disabled={addMember.isPending}
            >
              <SelectTrigger>
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
            onClick={handleSubmit}
            disabled={!chosenUserId || addMember.isPending}
          >
            {addMember.isPending ? "Adding…" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
