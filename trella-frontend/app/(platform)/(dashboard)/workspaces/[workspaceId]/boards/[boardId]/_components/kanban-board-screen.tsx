"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  BoardsService,
  ColumnsService,
  CustomStatusesService,
  ProjectMembersService,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { useBoardRealtime } from "@/lib/realtime/use-realtime";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskDetailModal } from "@/components/modals/task-detail-modal";

import { BoardHeader } from "./board-header";
import { KanbanBoard } from "./kanban-board";

interface KanbanBoardScreenProps {
  workspaceId: string;
  boardId: string;
}

export const KanbanBoardScreen = ({
  workspaceId,
  boardId,
}: KanbanBoardScreenProps) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: () => BoardsService.Boards_boardsGetBoard({ boardId }),
  });

  const columnsQuery = useQuery({
    queryKey: queryKeys.boardColumns(boardId),
    queryFn: () => ColumnsService.Columns_columnsListColumns({ boardId }),
  });

  const tasksQuery = useQuery({
    queryKey: queryKeys.boardTasks(boardId),
    queryFn: () => BoardsService.Boards_boardsListBoardTasks({ boardId }),
  });

  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () =>
      CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({
        workspaceId,
      }),
  });

  const boardData = boardQuery.data;
  const projectId = boardData?.projectId;

  // Live board updates: subscribe to the project channel and refresh the
  // board's task list when tasks are created/updated/moved elsewhere.
  useBoardRealtime({ projectId, boardId });

  const projectMembersQuery = useQuery({
    queryKey: queryKeys.projectMembers(projectId || ""),
    queryFn: () =>
      ProjectMembersService.ProjectMembers_projectMembersListMembers({
        projectId: projectId!,
      }),
    enabled: !!projectId,
  });

  const actorNames = useMemo(() => {
    const map: Record<string, string> = {};
    if (projectMembersQuery.data) {
      for (const m of projectMembersQuery.data) {
        map[m.userId] = m.fullName || m.email;
      }
    }
    return map;
  }, [projectMembersQuery.data]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId || !tasksQuery.data) return null;
    return tasksQuery.data.find((t) => t.id === selectedTaskId) ?? null;
  }, [selectedTaskId, tasksQuery.data]);

  const isLoading =
    boardQuery.isLoading ||
    columnsQuery.isLoading ||
    tasksQuery.isLoading ||
    customStatusesQuery.isLoading ||
    projectMembersQuery.isLoading;

  const isError =
    boardQuery.isError ||
    columnsQuery.isError ||
    tasksQuery.isError ||
    customStatusesQuery.isError ||
    projectMembersQuery.isError;

  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-background">
        <BoardHeaderSkeleton />
        <div className="flex-1 p-6">
          <KanbanBoardSkeleton />
        </div>
      </div>
    );
  }

  if (isError || !boardQuery.data) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <div className="text-center space-y-3">
          <h2 className="text-xl font-semibold text-destructive">Error Loading Board</h2>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t retrieve the board. Please verify your permissions or try again.
          </p>
        </div>
      </div>
    );
  }

  const board = boardQuery.data;
  const columns = columnsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const customStatuses = customStatusesQuery.data ?? [];

  const backgroundImage = board.imageFullUrl
    ? `url(${board.imageFullUrl})`
    : undefined;

  return (
    <div
      className="relative flex h-full flex-col bg-no-repeat bg-cover bg-center overflow-hidden"
      style={{ backgroundImage }}
    >
      <div className="absolute inset-0 bg-black/15 backdrop-blur-[1px]" />

      <div className="relative z-10 flex flex-col h-full overflow-hidden">
        <BoardHeader board={board} workspaceId={workspaceId} />

        <main className="flex-1 overflow-x-auto p-6">
          <KanbanBoard
            boardId={boardId}
            workspaceId={workspaceId}
            columns={columns}
            tasks={tasks}
            customStatuses={customStatuses}
            projectMembers={projectMembersQuery.data ?? []}
            onTaskClick={(task) => setSelectedTaskId(task.id)}
          />
        </main>
      </div>

      <TaskDetailModal
        open={!!selectedTaskId}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null);
        }}
        task={selectedTask}
        actorNames={actorNames}
      />
    </div>
  );
};

const BoardHeaderSkeleton = () => (
  <div className="flex items-center justify-between border-b bg-background/80 px-6 py-3.5 backdrop-blur">
    <Skeleton className="h-6 w-48" />
    <Skeleton className="h-8 w-24" />
  </div>
);

const KanbanBoardSkeleton = () => (
  <div className="flex gap-4 overflow-x-auto pb-4">
    {Array.from({ length: 3 }).map((_, colIndex) => (
      <div
        key={colIndex}
        className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/20 p-3.5 space-y-3.5"
      >
        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, cardIndex) => (
            <div
              key={cardIndex}
              className="rounded-md border bg-background/90 p-4 space-y-2.5 shadow-sm"
            >
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);
