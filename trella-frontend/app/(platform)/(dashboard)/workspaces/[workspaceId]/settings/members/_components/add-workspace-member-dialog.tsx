"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { WorkspaceMembersService } from "@/lib/client";
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

const WORKSPACE_ROLES = ["MEMBER", "ADMIN"] as const;
type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  MEMBER: "Member",
  ADMIN: "Admin",
};

interface AddWorkspaceMemberDialogProps {
  workspaceId: string;
  existingUserIds: Set<string>;
}

export const AddWorkspaceMemberDialog = ({
  workspaceId,
}: AddWorkspaceMemberDialogProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("MEMBER");

  const resetForm = () => {
    setEmail("");
    setRole("MEMBER");
  };

  const inviteMember = useMutation({
    mutationFn: () =>
      WorkspaceMembersService.WorkspaceMembers_workspaceMembersInviteMember({
        workspaceId,
        requestBody: { email: email.trim(), role },
      }),
    onSuccess: () => {
      toast.success("Invitation sent");
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceMembers(workspaceId),
      });
      setOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error("Failed to send invitation");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite workspace member</DialogTitle>
          <DialogDescription>
            Send an invitation to a user&apos;s email address.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Email address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              disabled={inviteMember.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(next) => setRole(next as WorkspaceRole)}
              disabled={inviteMember.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKSPACE_ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ROLE_LABELS[value]}
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
            disabled={inviteMember.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => inviteMember.mutate()}
            disabled={!email.trim() || inviteMember.isPending}
          >
            {inviteMember.isPending ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
