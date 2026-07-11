'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import GraphLineIcon from '@atlaskit/icon/core/chart-bar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SprintsService,
  BacklogService,
  TasksService,
  ProjectMembersService,
  CustomStatusesService,
  BoardsService,
  ColumnsService,
  WorkflowsService,
} from '@/lib/client';
import type { SprintWithTasks, TaskPublic } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import { TaskDetailDrawer } from '@/components/task-detail-drawer';

import { SprintSection } from './sprint-section';
import { BacklogSection } from './backlog-section';
import { InsightsPanel } from './insights-panel';

interface BacklogPageClientProps {
  workspaceId: string;
}

export function BacklogPageClient({ workspaceId }: BacklogPageClientProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInsights, setShowInsights] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);

  const sprintsQuery = useQuery({
    queryKey: queryKeys.workspaceSprints(workspaceId),
    queryFn: () => SprintsService.Sprints_sprintsListWorkspaceSprints({ workspaceId }),
  });

  const backlogQuery = useQuery({
    queryKey: queryKeys.workspaceBacklog(workspaceId),
    queryFn: () => BacklogService.Backlog_backlogGetWorkspaceBacklog({ workspaceId }),
  });

  // projectId from the first sprint/backlog task for members query
  const projectId = sprintsQuery.data?.[0]?.projectId ?? null;

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(projectId ?? ''),
    queryFn: () => ProjectMembersService.ProjectMembers_projectMembersListMembers({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId }),
  });

  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
  });
  const firstBoardId = boardsQuery.data?.[0]?.id ?? null;
  const columnsQuery = useQuery({
    queryKey: queryKeys.boardColumns(firstBoardId ?? ''),
    queryFn: () => ColumnsService.Columns_columnsListColumns({ boardId: firstBoardId! }),
    enabled: !!firstBoardId,
  });

  const workflowsQuery = useQuery({
    queryKey: ["workflows", workspaceId],
    queryFn: () => WorkflowsService.Workflows_workflowsListWorkflows({ workspaceId }),
  });

  const activeWorkflow = useMemo(() => {
    return workflowsQuery.data?.find((w) => w.isActive) || workflowsQuery.data?.[0];
  }, [workflowsQuery.data]);

  const workflowDetailQuery = useQuery({
    queryKey: ["workflow", activeWorkflow?.id],
    queryFn: () => WorkflowsService.Workflows_workflowsGetWorkflow({ workflowId: activeWorkflow!.id }),
    enabled: !!activeWorkflow?.id,
  });

  const sprints: SprintWithTasks[] = useMemo(() => sprintsQuery.data ?? [], [sprintsQuery.data]);
  const backlogTasks: TaskPublic[] = useMemo(() => backlogQuery.data ?? [], [backlogQuery.data]);
  const members = membersQuery.data ?? [];
  const customStatuses = customStatusesQuery.data ?? [];
  const columns = columnsQuery.data ?? [];

  const filterTask = useCallback((t: TaskPublic) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (memberFilter && t.assigneeId !== memberFilter) return false;
    return true;
  }, [search, memberFilter]);

  const filteredSprints = useMemo(
    () => sprints.map(s => ({ ...s, tasks: (s.tasks ?? []).filter(filterTask) })),
    [sprints, filterTask]
  );
  const filteredBacklog = useMemo(() => backlogTasks.filter(filterTask), [backlogTasks, filterTask]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    for (const sprint of sprints) {
      const t = (sprint.tasks ?? []).find(t => t.id === selectedTaskId);
      if (t) return t;
    }
    return backlogTasks.find(t => t.id === selectedTaskId) ?? null;
  }, [selectedTaskId, sprints, backlogTasks]);

  const createSprintMutation = useMutation({
    mutationFn: () => SprintsService.Sprints_sprintsCreateWorkspaceSprint({ workspaceId, requestBody: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      toast.success('Sprint created');
    },
    onError: () => toast.error('Failed to create sprint'),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, sprintId }: { taskId: string; sprintId: string | null }) =>
      TasksService.Tasks_tasksUpdateTask({ taskId, requestBody: { sprintId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
    },
    onError: () => {
      toast.error('Failed to move task');
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
    },
  });

  function onDragEnd(result: DropResult) {
    const { draggableId, destination, source } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const destId = destination.droppableId;
    const newSprintId = destId === 'backlog' ? null : destId.replace('sprint:', '');

    queryClient.setQueryData<SprintWithTasks[]>(queryKeys.workspaceSprints(workspaceId), old => {
      if (!old) return old;
      let movedTask: TaskPublic | undefined;
      const next = old.map(s => {
        const tasks = s.tasks ?? [];
        const idx = tasks.findIndex(t => t.id === draggableId);
        if (idx === -1) return s;
        movedTask = tasks[idx];
        return { ...s, tasks: tasks.filter(t => t.id !== draggableId) };
      });
      if (newSprintId && movedTask) {
        return next.map(s => {
          const tasks = s.tasks ?? [];
          return s.id === newSprintId
            ? { ...s, tasks: [...tasks.slice(0, destination.index), movedTask!, ...tasks.slice(destination.index)] }
            : s;
        });
      }
      return next;
    });

    if (!newSprintId) {
      const task = sprints.flatMap(s => s.tasks ?? []).find(t => t.id === draggableId);
      if (task) {
        queryClient.setQueryData<TaskPublic[]>(queryKeys.workspaceBacklog(workspaceId), old => {
          if (!old) return [task];
          const filtered = old.filter(t => t.id !== draggableId);
          return [...filtered.slice(0, destination.index), task, ...filtered.slice(destination.index)];
        });
      }
    } else {
      queryClient.setQueryData<TaskPublic[]>(
        queryKeys.workspaceBacklog(workspaceId),
        old => old?.filter(t => t.id !== draggableId)
      );
    }

    updateTaskMutation.mutate({ taskId: draggableId, sprintId: newSprintId });
  }

  const isLoading = sprintsQuery.isLoading || backlogQuery.isLoading;

  // projectId needed by SprintSection/BacklogSection for their own mutations
  // Fall back to first backlog task's projectId if no sprints yet
  const resolvedProjectId = projectId ?? backlogTasks[0]?.projectId ?? '';

  // ponytail: for the "+ Create" buttons in Sprint/Backlog sections we need a target
  // column on the underlying board. Prefer the first TODO column, else fall back to
  // the first column present.
  const todoColumnId =
    columns.find(c => c.statusKey === 'TODO')?.id ??
    columns[0]?.id ??
    '';

  return (
    <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px', paddingRight: showInsights ? 344 : 24, transition: 'padding-right 0.2s ease' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--trella-text)', margin: '0 0 16px' }}>Backlog</h1>

        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 220 }}>
            <Textfield value={search} onChange={e => setSearch((e.target as HTMLInputElement).value)} placeholder="Search backlog" aria-label="Search backlog" />
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {members.slice(0, 5).map(m => (
              <button
                key={m.userId}
                title={m.fullName ?? m.email}
                onClick={() => setMemberFilter(memberFilter === m.userId ? null : m.userId)}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  backgroundColor: memberFilter === m.userId ? '#579DFF' : '#0052CC',
                  border: memberFilter === m.userId ? '2px solid #1D7AFC' : '2px solid transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#fff', fontWeight: 600, padding: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} /> : (m.fullName ?? m.email).slice(0, 2).toUpperCase()}
              </button>
            ))}
          </div>
          <Button appearance="subtle">Filter</Button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowInsights(v => !v)}
            title="Toggle Backlog Insights"
            style={{
              width: 32, height: 32, borderRadius: 4,
              border: showInsights ? '1px solid #579DFF' : '1px solid var(--trella-border)',
              backgroundColor: showInsights ? 'rgba(29,122,252,0.1)' : 'var(--trella-surface)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: showInsights ? '#579DFF' : 'var(--trella-text-subtlest)',
            }}
          >
            <GraphLineIcon label="insights" size="small" />
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><span style={{ fontSize: 13, color: 'var(--trella-text-subtlest)' }}>Loading...</span></div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
               {filteredSprints.map(sprint => (
                <SprintSection
                  key={sprint.id}
                  sprint={sprint}
                  allSprints={sprints}
                  projectId={sprint.projectId}
                  workspaceId={workspaceId}
                  members={members}
                  customStatuses={customStatuses}
                  onTaskClick={id => setSelectedTaskId(id)}
                  boardId={firstBoardId ?? ''}
                  todoColumnId={todoColumnId}
                  transitions={workflowDetailQuery.data?.transitions || []}
                />
              ))}
              <BacklogSection
                tasks={filteredBacklog}
                projectId={resolvedProjectId}
                workspaceId={workspaceId}
                members={members}
                customStatuses={customStatuses}
                onTaskClick={id => setSelectedTaskId(id)}
                onCreateSprint={() => createSprintMutation.mutate()}
                boardId={firstBoardId ?? ''}
                todoColumnId={todoColumnId}
                transitions={workflowDetailQuery.data?.transitions || []}
              />
            </div>
          </DragDropContext>
        )}
      </div>

      {showInsights && resolvedProjectId && (
        <InsightsPanel projectId={resolvedProjectId} sprints={sprints} onClose={() => setShowInsights(false)} />
      )}

      <TaskDetailDrawer open={!!selectedTaskId} onClose={() => setSelectedTaskId(null)} task={selectedTask ?? null} workspaceId={workspaceId} projectMembers={members} columns={columns} />
    </div>
  );
}

