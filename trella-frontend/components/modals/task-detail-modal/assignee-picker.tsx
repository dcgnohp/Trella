"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, UserX } from "lucide-react";

import {
  ProjectMembersService,
  TasksService,
  type ProjectMemberPublic,
  type TaskPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AssigneePickerProps {
  task: TaskPublic;
  /** Optional: called after the assignee is successfully changed. */
  onAssigneeChange?: (task: TaskPublic) => void;
}

function initials(fullName: string | null | undefined, email: string): string {
  const name = fullName?.trim() || email;
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AssigneePicker({ task, onAssigneeChange }: AssigneePickerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(task.projectId),
    queryFn: () =>
      ProjectMembersService.ProjectMembers_projectMembersListMembers({
        projectId: task.projectId,
      }),
    enabled: open,
    staleTime: 30_000,
  });

  const members: ProjectMemberPublic[] = React.useMemo(() => {
    const all = membersQuery.data ?? [];
    const active = all.filter((m) => m.status === "ACTIVE");
    if (!search.trim()) return active;
    const lower = search.toLowerCase();
    return active.filter(
      (m) =>
        m.fullName?.toLowerCase().includes(lower) ||
        m.email.toLowerCase().includes(lower),
    );
  }, [membersQuery.data, search]);

  const setAssignee = useMutation({
    mutationFn: (userId: string) =>
      TasksService.Tasks_tasksSetAssignee({
        taskId: task.id,
        requestBody: { assigneeId: userId },
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.boardTasks(task.boardId),
      });
      onAssigneeChange?.(updated);
      setOpen(false);
    },
    onError: () => toast.error("Failed to assign task"),
  });

  const unsetAssignee = useMutation({
    mutationFn: () =>
      TasksService.Tasks_tasksUnsetAssignee({ taskId: task.id }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.boardTasks(task.boardId),
      });
      onAssigneeChange?.(updated);
      setOpen(false);
    },
    onError: () => toast.error("Failed to unassign task"),
  });

  const currentAssignee = React.useMemo(() => {
    if (!task.assigneeId || !membersQuery.data) return null;
    return membersQuery.data.find((m) => m.userId === task.assigneeId) ?? null;
  }, [task.assigneeId, membersQuery.data]);

  const isPending = setAssignee.isPending || unsetAssignee.isPending;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-[140px] justify-between gap-2 px-2 text-sm font-normal"
          disabled={isPending}
        >
          {task.assigneeId ? (
            <span className="flex items-center gap-2 truncate">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">
                  {initials(currentAssignee?.fullName, currentAssignee?.email ?? "")}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">
                {currentAssignee?.fullName?.trim() ||
                  currentAssignee?.email ||
                  "Assigned"}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-2" align="start">
        <Input
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-8 text-sm"
          autoFocus
        />

        <div className="max-h-52 overflow-y-auto">
          {task.assigneeId && (
            <button
              onClick={() => unsetAssignee.mutate()}
              disabled={isPending}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              <UserX className="h-4 w-4" />
              Unassign
            </button>
          )}

          {membersQuery.isLoading ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Loading…
            </p>
          ) : members.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No members found
            </p>
          ) : (
            members.map((member) => {
              const label = member.fullName?.trim() || member.email;
              const isSelected = member.userId === task.assigneeId;
              return (
                <button
                  key={member.userId}
                  onClick={() => {
                    if (!isSelected) setAssignee.mutate(member.userId);
                    else setOpen(false);
                  }}
                  disabled={isPending}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted",
                    isSelected && "font-medium",
                  )}
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[10px]">
                      {initials(member.fullName, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-left">{label}</span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
