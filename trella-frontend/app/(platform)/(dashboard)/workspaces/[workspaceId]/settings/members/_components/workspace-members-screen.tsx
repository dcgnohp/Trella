"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";

import {
  WorkspaceMembersService,
  type WorkspaceMemberPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { AddWorkspaceMemberDialog } from "./add-workspace-member-dialog";

interface WorkspaceMembersScreenProps {
  workspaceId: string;
}

function initialsFor(userId: string): string {
  return userId.slice(0, 2).toUpperCase();
}

export const WorkspaceMembersScreen = ({
  workspaceId,
}: WorkspaceMembersScreenProps) => {
  const { user } = useAuth();

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

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const existingUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );

  const currentMembership = useMemo(
    () => members.find((m) => m.userId === user?.id),
    [members, user?.id],
  );

  const isAdmin = currentMembership?.role === "ADMIN";

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
        />
      )}
    </div>
  );
};

const MembersTable = ({
  members,
  currentUserId,
}: {
  members: WorkspaceMemberPublic[];
  currentUserId: string | undefined;
}) => (
  <div className="overflow-hidden rounded-md border">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <th className="px-4 py-3 font-medium">Member</th>
          <th className="px-4 py-3 font-medium">Role</th>
          <th className="px-4 py-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          return (
            <tr key={member.id} className="hover:bg-muted/20">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">
                      {initialsFor(member.userId)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <span className="font-medium font-mono text-xs">
                      {member.userId}
                    </span>
                    {isSelf ? (
                      <Badge variant="outline" className="rounded px-1.5 py-0">
                        You
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {member.role}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={member.status === "ACTIVE" ? "default" : "warning"}
                  className="rounded px-1.5 py-0"
                >
                  {member.status}
                </Badge>
              </td>
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
    <Users className="mb-3 h-8 w-8 text-muted-foreground" />
    <p className="text-sm font-medium">No members yet</p>
    <p className="mt-1 text-sm text-muted-foreground">
      Invite people to join this workspace.
    </p>
  </div>
);
