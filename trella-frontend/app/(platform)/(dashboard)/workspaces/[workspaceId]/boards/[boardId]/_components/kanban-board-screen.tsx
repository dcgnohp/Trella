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
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { useAuth } from "@/components/providers/auth-provider";

import { BoardHeader } from "./board-header";
import { KanbanBoard } from "./kanban-board";
import { StandupPanel } from "./standup-panel";
import { ManageWorkflowModal } from "./manage-workflow-modal";
import { EMPTY_FILTERS, type FilterState } from "./filter-panel";

interface KanbanBoardScreenProps {
  workspaceId: string;
  boardId: string;
}

export const KanbanBoardScreen = ({
  workspaceId,
  boardId,
}: KanbanBoardScreenProps) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [standupActive, setStandupActive] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const { user } = useAuth();

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

  const canManageQuery = useQuery({
    queryKey: ["status-admin", workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/status-admin`, { cache: "no-store" });
      if (!res.ok) return { canManage: false };
      return res.json() as Promise<{ canManage: boolean }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const workspaceModeQuery = useQuery({
    queryKey: ["workspace-mode", workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}`, { cache: "no-store" });
      if (!res.ok) return { mode: "KANBAN" };
      return res.json() as Promise<{ mode: string }>;
    },
    staleTime: 5 * 60 * 1000,
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

  // Group subtasks by parentId across ALL tasks (including hidden subtasks)
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, import("@/lib/client").TaskPublic[]>();
    for (const t of tasksQuery.data ?? []) {
      if (t.parentId) {
        const list = map.get(t.parentId) ?? [];
        list.push(t);
        map.set(t.parentId, list);
      }
    }
    return map;
  }, [tasksQuery.data]);

  const filteredTasks = useMemo(() => {
    const all = tasksQuery.data ?? [];
    return all.filter(task => {
      // Subtasks (parentId set) are shown inside task detail — not on the main board
      if (task.parentId) return false;
      if (filters.onlyMine && task.assigneeId !== user?.id) return false;
      if (!filters.onlyMine && filters.assigneeId && task.assigneeId !== filters.assigneeId) return false;
      if (filters.statusIds.length > 0 && !filters.statusIds.includes(task.customStatusId ?? "")) return false;
      if (filters.typeFilter && (task.type ?? "task").toLowerCase() !== filters.typeFilter.toLowerCase()) return false;
      return true;
    });
  }, [tasksQuery.data, filters, user?.id]);

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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--trella-surface-sunken)' }}>
        <BoardHeaderSkeleton />
        <div style={{ flex: 1, padding: 24 }}>
          <KanbanBoardSkeleton />
        </div>
      </div>
    );
  }

  if (isError || !boardQuery.data) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--trella-surface-sunken)', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#FF5630' }}>Error Loading Board</h2>
          <p style={{ fontSize: 14, color: 'var(--trella-text-subtle)', marginTop: 8 }}>
            We couldn&apos;t retrieve the board. Please verify your permissions or try again.
          </p>
        </div>
      </div>
    );
  }

  const board = boardQuery.data;
  const columns = columnsQuery.data ?? [];
  const customStatuses = customStatusesQuery.data ?? [];
  const members = projectMembersQuery.data ?? [];

  const isScrum =
    workspaceModeQuery.data?.mode === 'SCRUM' ||
    (typeof window !== 'undefined' && window.localStorage.getItem(`trella:projectType:${workspaceId}`) === 'scrum');

  return (
    <div style={{ display: "flex", height: "100%", backgroundColor: "var(--trella-surface-sunken)", overflow: "hidden" }}>
      {standupActive && (
        <StandupPanel members={members} onClose={() => setStandupActive(false)} />
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <BoardHeader
          board={board}
          workspaceId={workspaceId}
          canManageStatuses={canManageQuery.data?.canManage ?? false}
          filters={filters}
          onFiltersChange={setFilters}
          projectMembers={members}
          customStatuses={customStatuses}
          currentUserId={user?.id ?? null}
          onStartStandup={() => setStandupActive(true)}
          onManageWorkflow={() => setWorkflowOpen(true)}
        />
        <main style={{ flex: 1, overflowX: "auto", padding: "16px 20px" }}>
          <KanbanBoard
            boardId={boardId}
            workspaceId={workspaceId}
            columns={columns}
            tasks={filteredTasks}
            subtasksByParent={subtasksByParent}
            customStatuses={customStatuses}
            projectMembers={members}
            onTaskClick={(task) => setSelectedTaskId(task.id)}
            isScrum={isScrum}
            boardIsEmpty={(tasksQuery.data ?? []).length === 0}
          />
        </main>
      </div>

      <TaskDetailDrawer
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTask}
        actorNames={actorNames}
        workspaceId={workspaceId}
        projectMembers={members}
        columns={columns}
      />

      <ManageWorkflowModal
        open={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        boardName={board.title}
        customStatuses={customStatuses}
      />
    </div>
  );
};

const BoardHeaderSkeleton = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--trella-border)', padding: '10px 20px', backgroundColor: 'transparent' }}>
    <div style={{ height: 24, width: 192, borderRadius: 4, backgroundColor: 'var(--trella-border)' }} />
    <div style={{ height: 32, width: 96, borderRadius: 4, backgroundColor: 'var(--trella-border)' }} />
  </div>
);

const KanbanBoardSkeleton = () => (
  <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 16 }}>
    {Array.from({ length: 3 }).map((_, colIndex) => (
      <div key={colIndex} style={{ width: 272, flexShrink: 0, borderRadius: 6, backgroundColor: 'var(--trella-surface)', padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ height: 20, width: 96, borderRadius: 4, backgroundColor: 'var(--trella-border)' }} />
          <div style={{ height: 20, width: 20, borderRadius: '50%', backgroundColor: 'var(--trella-border)' }} />
        </div>
        {Array.from({ length: 3 }).map((_, cardIndex) => (
          <div key={cardIndex} style={{ borderRadius: 4, backgroundColor: 'var(--trella-surface-sunken)', padding: 16, marginBottom: 8 }}>
            <div style={{ height: 16, borderRadius: 4, backgroundColor: 'var(--trella-border)', marginBottom: 8 }} />
            <div style={{ height: 14, width: '66%', borderRadius: 4, backgroundColor: 'var(--trella-border)' }} />
          </div>
        ))}
      </div>
    ))}
  </div>
);
