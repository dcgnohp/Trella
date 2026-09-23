"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";

import { BoardMembersService, type BoardMemberPublic } from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { AddBoardMemberDialog } from "./add-board-member-dialog";
import { RemoveBoardMemberDialog } from "./remove-board-member-dialog";
import { BoardRoleSelect } from "./board-role-select";
import { apiErrorMessage, initialsFor } from "./board-roles";

interface BoardMembersScreenProps {
  projectId: string;
  boardId: string;
}

export const BoardMembersScreen = ({ projectId, boardId }: BoardMembersScreenProps) => {
  const { user } = useAuth();

  const membersQuery = useQuery({
    queryKey: queryKeys.boardMembers(boardId),
    queryFn: () =>
      BoardMembersService.BoardMembers_boardMembersListMembers({ boardId }),
  });

  useEffect(() => {
    if (membersQuery.isError) {
      toast.error(apiErrorMessage(membersQuery.error, "Failed to load members"));
    }
  }, [membersQuery.isError, membersQuery.error]);

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const existingUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );

  const currentMembership = useMemo(
    () => members.find((m) => m.userId === user?.id),
    [members, user?.id],
  );

  const isAdmin = currentMembership?.role === "BOARD_ADMIN";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Board Members</h1>
          <p className="text-sm text-muted-foreground">
            Manage who has access to this board and their role.
          </p>
        </div>
        {isAdmin ? (
          <AddBoardMemberDialog
            projectId={projectId}
            boardId={boardId}
            existingUserIds={existingUserIds}
          />
        ) : null}
      </header>

      {membersQuery.isLoading ? (
        <BoardMembersTableSkeleton />
      ) : membersQuery.isError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-6 text-sm text-destructive">
          {apiErrorMessage(membersQuery.error, "Failed to load members.")}
        </p>
      ) : !isAdmin ? (
        <AccessDenied />
      ) : members.length === 0 ? (
        <EmptyState />
      ) : (
        <BoardMembersTable
          boardId={boardId}
          members={members}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
};

const BoardMembersTable = ({
  boardId,
  members,
  currentUserId,
}: {
  boardId: string;
  members: BoardMemberPublic[];
  currentUserId: string | undefined;
}) => (
  <div className="overflow-hidden rounded-md border">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <th className="px-4 py-3 font-medium">Member</th>
          <th className="px-4 py-3 font-medium">Email</th>
          <th className="px-4 py-3 font-medium">Board Role</th>
          <th className="px-4 py-3 text-right font-medium">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {members.map((member) => {
          const label = member.fullName?.trim() || member.email;
          const isSelf = member.userId === currentUserId;
          return (
            <tr key={member.id} className="hover:bg-muted/20">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">
                      {initialsFor(member.fullName, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{label}</span>
                      {member.status === "PENDING" && (
                        <Badge variant="warning" className="rounded px-1.5 py-0">
                          Pending
                        </Badge>
                      )}
                      {isSelf && (
                        <Badge variant="outline" className="rounded px-1.5 py-0">
                          You
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
              <td className="px-4 py-3">
                <BoardRoleSelect
                  boardId={boardId}
                  userId={member.userId}
                  role={member.role}
                  disabled={isSelf}
                />
              </td>
              <td className="px-4 py-3 text-right">
                <RemoveBoardMemberDialog
                  boardId={boardId}
                  userId={member.userId}
                  memberLabel={label}
                  disabled={isSelf}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const BoardMembersTableSkeleton = () => (
  <div className="overflow-hidden rounded-md border">
    <div className="border-b bg-muted/40 px-4 py-3">
      <Skeleton className="h-4 w-24" />
    </div>
    <div className="divide-y">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-9 w-[150px]" />
          <Skeleton className="h-9 w-9" />
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
      Add project members to this board to control their access.
    </p>
  </div>
);

const AccessDenied = () => (
  <div className="flex flex-col items-center justify-center rounded-md border border-dashed px-6 py-16 text-center">
    <p className="text-sm font-medium">
      You don&apos;t have access to manage board members
    </p>
    <p className="mt-1 text-sm text-muted-foreground">
      Only board admins can manage board members.
    </p>
  </div>
);
