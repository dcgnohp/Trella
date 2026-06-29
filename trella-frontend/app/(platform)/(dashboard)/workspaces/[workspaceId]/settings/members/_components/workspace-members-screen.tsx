"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DeleteIcon from "@atlaskit/icon/core/delete";
import PeopleGroupIcon from "@atlaskit/icon/core/people-group";
import Spinner from "@atlaskit/spinner";

import {
  WorkspaceMembersService,
  type WorkspaceMemberPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { AddWorkspaceMemberDialog } from "./add-workspace-member-dialog";

interface WorkspaceMembersScreenProps {
  workspaceId: string;
}

function initialsFor(fullName: string | null | undefined, email: string): string {
  const name = fullName?.trim() || email;
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success",
  PENDING: "warning",
  DECLINED: "secondary",
  REMOVED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  DECLINED: "Declined",
  REMOVED: "Removed",
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const WorkspaceMembersScreen = ({
  workspaceId,
}: WorkspaceMembersScreenProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () =>
      WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({
        workspaceId,
      }),
  });

  useEffect(() => {
    if (membersQuery.isError) {
      toast.error("Failed to load workspace members");
    }
  }, [membersQuery.isError]);

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      WorkspaceMembersService.WorkspaceMembers_workspaceMembersRemoveMember({
        workspaceId,
        userId,
      }),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) });
    },
    onError: () => toast.error("Failed to remove member"),
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const existingUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );

  const currentMembership = useMemo(
    () => members.find((m) => m.userId === user?.id),
    [members, user?.id],
  );

  const isAdmin =
    currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Workspace Members
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage who has access to this workspace.
          </p>
        </div>
        {isAdmin ? (
          <AddWorkspaceMemberDialog
            workspaceId={workspaceId}
            existingUserIds={existingUserIds}
          />
        ) : null}
      </header>

      {membersQuery.isLoading ? (
        <MembersTableSkeleton />
      ) : membersQuery.isError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-6 text-sm text-destructive">
          Failed to load workspace members.
        </p>
      ) : members.length === 0 ? (
        <EmptyState />
      ) : (
        <MembersTable
          members={members}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          removingUserId={removeMutation.isPending ? removeMutation.variables : undefined}
          onRemove={(userId) => removeMutation.mutate(userId)}
        />
      )}
    </div>
  );
};

const MembersTable = ({
  members,
  currentUserId,
  isAdmin,
  removingUserId,
  onRemove,
}: {
  members: WorkspaceMemberPublic[];
  currentUserId: string | undefined;
  isAdmin: boolean;
  removingUserId: string | undefined;
  onRemove: (userId: string) => void;
}) => (
  <div className="overflow-hidden rounded-md border">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <th className="px-4 py-3 font-medium">Member</th>
          <th className="px-4 py-3 font-medium">Email</th>
          <th className="px-4 py-3 font-medium">Role</th>
          <th className="px-4 py-3 font-medium">Status</th>
          {isAdmin ? <th className="px-4 py-3 font-medium w-12" /> : null}
        </tr>
      </thead>
      <tbody className="divide-y">
        {members.map((member) => {
          const label = member.fullName?.trim() || member.email;
          const isSelf = member.userId === currentUserId;
          const isRemoving = removingUserId === member.userId;
          const canRemove = isAdmin && !isSelf && member.status !== "REMOVED";
          return (
            <tr key={member.id} className="hover:bg-muted/20">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">
                      {initialsFor(member.fullName, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <span className={member.status === "REMOVED" ? "font-medium text-muted-foreground line-through" : "font-medium"}>
                      {label}
                    </span>
                    {isSelf ? (
                      <Badge variant="outline" className="rounded px-1.5 py-0">
                        You
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
              <td className="px-4 py-3 text-muted-foreground">{ROLE_LABEL[member.role] ?? member.role}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={STATUS_VARIANT[member.status] ?? "secondary"}
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                >
                  {STATUS_LABEL[member.status] ?? member.status}
                </Badge>
              </td>
              {isAdmin ? (
                <td className="px-4 py-3">
                  {canRemove ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={isRemoving}
                      onClick={() => onRemove(member.userId)}
                    >
                      {isRemoving ? (
                        <Spinner size="small" />
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center' }}><DeleteIcon label="Remove" size="small" /></span>
                      )}
                    </Button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const MembersTableSkeleton = () => (
  <div className="overflow-hidden rounded-md border">
    <div className="border-b bg-muted/40 px-4 py-3">
      <Skeleton className="h-4 w-24" />
    </div>
    <div className="divide-y">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  </div>
);

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center rounded-md border border-dashed px-6 py-16 text-center">
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: '#97A0AF' }}><PeopleGroupIcon label="" size="medium" /></span>
    <p className="text-sm font-medium">No members yet</p>
    <p className="mt-1 text-sm text-muted-foreground">
      Invite people to join this workspace.
    </p>
  </div>
);
