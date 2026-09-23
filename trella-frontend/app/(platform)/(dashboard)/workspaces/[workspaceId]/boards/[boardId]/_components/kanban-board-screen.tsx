"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  BoardsService,
  ColumnsService,
  CustomStatusesService,
  ProjectMembersService,
  SprintsService,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { useBoardRealtime } from "@/lib/realtime/use-realtime";
import { setLastVisitedCookie } from "@/lib/last-visited";
import { useWorkspaceMode } from "@/lib/workspace-mode/use-workspace-mode";
import { isTaskVisibleOnScrumBoard } from "@/lib/board/scrum-board-filter";
import { useContributeConversationContext } from "@/lib/ai/conversation-context";
import { useAuth } from "@/components/providers/auth-provider";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BoardHeader } from "./board-header";
import { StandupPanel } from "./standup-panel";
import { EMPTY_FILTERS, type FilterState } from "./filter-panel";

const TaskDetailDrawer = dynamic(
  () => import("@/components/task-detail-drawer").then(m => ({ default: m.TaskDetailDrawer })),
  { ssr: false }
);
const KanbanBoard = dynamic(
  () => import("./kanban-board").then(m => ({ default: m.KanbanBoard })),
  { ssr: false }
);
const ManageWorkflowModal = dynamic(
  () => import("./manage-workflow-modal").then(m => ({ default: m.ManageWorkflowModal })),
  { ssr: false }
);

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

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task");

  // Deep link: open the task drawer when ?task= is present (on mount + when the
  // param changes). Unknown id → selectedTask resolves null → drawer shows
  // nothing, no crash.
  useEffect(() => {
    if (taskParam) setSelectedTaskId(taskParam);
  }, [taskParam]);

  // Closing the drawer strips ?task= so it doesn't re-open on the next render.
  const closeTaskDrawer = React.useCallback(() => {
    setSelectedTaskId(null);
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("task")) {
      params.delete("task");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

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

  const workspaceModeQuery = useWorkspaceMode(workspaceId);

  const boardData = boardQuery.data;
  const projectId = boardData?.projectId;

  const isScrum =
    workspaceModeQuery.data?.mode === 'SCRUM' ||
    (typeof window !== 'undefined' && window.localStorage.getItem(`trella:projectType:${workspaceId}`) === 'scrum');

  // Scrum boards mirror the running sprint only — backlog (no sprint) and other
  // sprints stay in the Backlog tab. Kanban has no sprints, so this is skipped.
  const sprintsQuery = useQuery({
    queryKey: ['sprints', projectId || ''],
    queryFn: () => SprintsService.Sprints_sprintsListSprints({ projectId: projectId! }),
    enabled: !!projectId && isScrum,
  });
  const activeSprintId = useMemo(
    () => sprintsQuery.data?.find((s) => s.status === 'ACTIVE')?.id ?? null,
    [sprintsQuery.data],
  );

  useEffect(() => {
    setLastVisitedCookie(workspaceId, boardId);
  }, [workspaceId, boardId]);

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
      // Scrum: only the active sprint's tasks belong on the board. Backlog tasks
      // (sprintId null) and non-active sprints are hidden. No active sprint => empty board.
      if (!isTaskVisibleOnScrumBoard(task.sprintId, isScrum, activeSprintId)) return false;
      if (filters.onlyMine && task.assigneeId !== user?.id) return false;
      if (!filters.onlyMine && filters.assigneeId && task.assigneeId !== filters.assigneeId) return false;
      if (filters.statusIds.length > 0 && !filters.statusIds.includes(task.customStatusId ?? "")) return false;
      if (filters.typeFilter && (task.type ?? "task").toLowerCase() !== filters.typeFilter.toLowerCase()) return false;
      return true;
    });
  }, [tasksQuery.data, filters, user?.id, isScrum, activeSprintId]);

  // Drives the "plan & start a sprint" hint: true when the board surface has no
  // work (Scrum: nothing in the active sprint; Kanban: no tasks at all), ignoring
  // user-applied filters.
  const boardIsEmpty = useMemo(
    () =>
      !(tasksQuery.data ?? [])
        .filter((t) => !t.parentId)
        .some((t) => isTaskVisibleOnScrumBoard(t.sprintId, isScrum, activeSprintId)),
    [tasksQuery.data, isScrum, activeSprintId],
  );

  // Contribute the board's already-loaded data to the AI chat (payload-mode,
  // no extra fetch). Runs before the loading/error early returns so hook order
  // stays stable. The builder trims the task list.
  const activeSprint = useMemo(
    () => sprintsQuery.data?.find((s) => s.status === 'ACTIVE') ?? null,
    [sprintsQuery.data],
  );
  useContributeConversationContext({
    ids: {
      workspaceId,
      projectId: boardData?.projectId ?? selectedTask?.projectId ?? activeSprint?.projectId,
      sprintId: activeSprint?.id,
      taskId: selectedTask?.id,
    },
    board: {
      title: boardData?.title,
      columns: (columnsQuery.data ?? []).map((c) => c.name),
    },
    sprint: activeSprint
      ? {
          name: activeSprint.name,
          goal: activeSprint.goal,
          status: activeSprint.status,
          startDate: activeSprint.startDate,
          endDate: activeSprint.endDate,
        }
      : undefined,
    task: selectedTask
      ? {
          title: selectedTask.title,
          issueKey: selectedTask.issueKey,
          status: selectedTask.customStatus?.name,
          priority: selectedTask.priority,
          storyPoint: selectedTask.storyPoint,
          description: selectedTask.description,
        }
      : undefined,
    tasks: filteredTasks.map((t) => ({
      title: t.title,
      status: t.customStatus?.name ?? null,
    })),
  });

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
          isScrum={isScrum}
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
            boardIsEmpty={boardIsEmpty}
            onManageWorkflow={() => setWorkflowOpen(true)}
          />
        </main>
      </div>

      <TaskDetailDrawer
        open={!!selectedTaskId}
        onClose={closeTaskDrawer}
        task={selectedTask}
        actorNames={actorNames}
        workspaceId={workspaceId}
        projectMembers={members}
        columns={columns}
        onManageWorkflow={() => setWorkflowOpen(true)}
      />

      <ManageWorkflowModal
        open={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        boardName={board.title}
        customStatuses={customStatuses}
        workspaceId={workspaceId}
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
