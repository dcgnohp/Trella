'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BacklogService,
  WorkspaceMembersService,
  CustomStatusesService,
  BoardsService,
  ColumnsService,
  TasksService,
  CardsService,
  type TaskUpdate,
} from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { GanttChart, type GanttEpic } from '../../plans/[planId]/timeline/_components/gantt-chart';

const TaskDetailDrawer = dynamic(
  () => import('@/components/task-detail-drawer').then(m => ({ default: m.TaskDetailDrawer })),
  { ssr: false }
);

interface TimelinePageClientProps {
  workspaceId: string;
}

export function TimelinePageClient({ workspaceId }: TimelinePageClientProps) {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Queries
  const tasksQuery = useQuery({
    queryKey: queryKeys.workspaceBacklog(workspaceId),
    queryFn: () => BacklogService.Backlog_backlogGetWorkspaceBacklog({ workspaceId }),
  });

  const workspaceMembersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId }),
  });

  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId }),
  });

  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
  });
  const firstBoardId = boardsQuery.data?.[0]?.id;

  const columnsQuery = useQuery({
    queryKey: queryKeys.boardColumns(firstBoardId ?? ''),
    queryFn: () => ColumnsService.Columns_columnsListColumns({ boardId: firstBoardId! }),
    enabled: !!firstBoardId,
  });

  // Task Update Mutation (drag/resize dates & story points)
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, requestBody }: { taskId: string; requestBody: TaskUpdate }) =>
      TasksService.Tasks_tasksUpdateTask({ taskId, requestBody }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
    },
  });

  // Task Delete Mutation
  const deleteTaskMutation = useMutation({
    mutationFn: (cardId: string) => CardsService.Cards_cardsDeleteCard({ cardId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
    },
  });

  // Map workspace tasks into GanttEpic items
  const ganttEpics = useMemo((): GanttEpic[] => {
    const tasks = tasksQuery.data ?? [];
    const members = workspaceMembersQuery.data ?? [];
    const statuses = customStatusesQuery.data ?? [];

    const todayStr = new Date().toISOString().slice(0, 10);

    return tasks.map((t, idx) => {
      const statusObj = statuses.find(s => s.id === t.customStatusId) || (t as any).customStatus;
      const assigneeObj = members.find(m => m.userId === t.assigneeId);
      const sp = t.storyPoint ?? (t as any).storyPoints ?? null;

      const resolvedStatus = statusObj
        ? { id: statusObj.id, name: statusObj.name, canonicalStatus: (statusObj as any).canonicalStatus || 'IN_PROGRESS' }
        : { id: t.customStatusId || 'todo', name: 'To Do', canonicalStatus: 'TODO' };

      const computedStart = t.startDate
        ? t.startDate.slice(0, 10)
        : (t.createdAt ? t.createdAt.slice(0, 10) : todayStr);

      const computedEnd = t.dueDate
        ? t.dueDate.slice(0, 10)
        : (() => {
            const d = new Date(computedStart);
            d.setDate(d.getDate() + 5);
            return d.toISOString().slice(0, 10);
          })();

      return {
        id: t.id,
        title: t.title,
        startDate: computedStart,
        dueDate: computedEnd,
        type: t.type || 'TASK',
        issueKey: t.issueKey || `TSK-${t.position ?? (idx + 1)}`,
        priority: t.priority,
        storyPoint: sp,
        storyPoints: sp,
        assigneeName: assigneeObj ? (assigneeObj.fullName || assigneeObj.email) : undefined,
        customStatusId: t.customStatusId,
        customStatus: resolvedStatus,
      };
    });
  }, [tasksQuery.data, workspaceMembersQuery.data, customStatusesQuery.data]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId || !tasksQuery.data) return null;
    return tasksQuery.data.find(t => t.id === selectedTaskId) ?? null;
  }, [selectedTaskId, tasksQuery.data]);

  const projectMembers = useMemo(() => {
    const members = workspaceMembersQuery.data ?? [];
    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.email,
      fullName: m.fullName || null,
      avatarUrl: null,
      projectRole: m.role,
      status: m.status,
    }));
  }, [workspaceMembersQuery.data]);

  const handleEpicDateChange = (epicId: string, updates: { startDate: string; dueDate: string; storyPoints?: number }) => {
    updateTaskMutation.mutate({
      taskId: epicId,
      requestBody: {
        startDate: updates.startDate,
        dueDate: updates.dueDate,
        ...(updates.storyPoints !== undefined ? { storyPoint: updates.storyPoints } : {}),
      },
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--trella-surface, #FFFFFF)' }}>
      {/* Gantt Chart View */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <GanttChart
          epics={ganttEpics}
          onEpicDateChange={handleEpicDateChange}
          onSelectTask={(task: GanttEpic) => setSelectedTaskId(task.id)}
          onDeleteTask={(taskId: string) => deleteTaskMutation.mutate(taskId)}
        />
      </div>

      {/* Task detail drawer */}
      <TaskDetailDrawer
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTask}
        workspaceId={workspaceId}
        projectMembers={projectMembers}
        columns={columnsQuery.data ?? []}
      />
    </div>
  );
}
