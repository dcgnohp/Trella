'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import GraphLineIcon from '@atlaskit/icon/core/chart-bar';
import FilterIcon from '@atlaskit/icon/core/filter';
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
  CardsService,
} from '@/lib/client';
import type { SprintWithTasks, TaskPublic } from '@/lib/client';
import type { DropResult } from '@hello-pangea/dnd';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import { ConfirmModal } from '@/components/ads/confirm-modal';

// Heavy components — lazy loaded to cut ~250kB from initial bundle
const TaskDetailDrawer = dynamic(
  () => import('@/components/task-detail-drawer').then(m => ({ default: m.TaskDetailDrawer })),
  { ssr: false }
);
const DragDropContext = dynamic(
  () => import('@hello-pangea/dnd').then(m => ({ default: m.DragDropContext })),
  { ssr: false }
);
const SprintSection = dynamic(
  () => import('./sprint-section').then(m => ({ default: m.SprintSection })),
  { ssr: false }
);
const BacklogSection = dynamic(
  () => import('./backlog-section').then(m => ({ default: m.BacklogSection })),
  { ssr: false }
);
const CompletedSprintsModal = dynamic(
  () => import('./completed-sprints-modal').then(m => ({ default: m.CompletedSprintsModal })),
  { ssr: false }
);

import { InsightsPanel } from './insights-panel';

interface BacklogPageClientProps {
  workspaceId: string;
}

export function BacklogPageClient({ workspaceId }: BacklogPageClientProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInsights, setShowInsights] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const lastSelectedIdRef = React.useRef<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const taskParam = searchParams.get('task');

  // Deep link: open the drawer when ?task= is present (on mount and whenever the
  // param changes). If the id isn't a loaded task, selectedTask stays null and
  // the drawer shows nothing — no crash.
  useEffect(() => {
    if (taskParam) setSelectedTaskId(taskParam);
  }, [taskParam]);

  // Closing the drawer also strips ?task= so it doesn't re-open. ponytail:
  // rebuild the query string minus `task` and replace() — no history entry.
  const closeTaskDrawer = useCallback(() => {
    setSelectedTaskId(null);
    const params = new URLSearchParams(searchParams.toString());
    if (params.has('task')) {
      params.delete('task');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

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

  const activeFilterCount = (memberFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (priorityFilter ? 1 : 0) + (typeFilter ? 1 : 0);

  const filterTask = useCallback((t: TaskPublic) => {
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchKey = t.issueKey?.toLowerCase().includes(q);
      if (!matchTitle && !matchKey) return false;
    }
    if (memberFilter && t.assigneeId !== memberFilter) return false;
    if (statusFilter && t.customStatusId !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (typeFilter && t.type !== typeFilter) return false;
    return true;
  }, [search, memberFilter, statusFilter, priorityFilter, typeFilter]);

  const [sortBy, setSortBy] = useState<'MANUAL' | 'PRIORITY_DESC' | 'PRIORITY_ASC' | 'DUE_DATE' | 'TITLE' | 'STATUS'>('MANUAL');

  const PRIORITY_RANK: Record<string, number> = {
    URGENT: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  const sortTasks = useCallback((tasks: TaskPublic[]) => {
    if (sortBy === 'MANUAL') return tasks;
    return [...tasks].sort((a, b) => {
      if (sortBy === 'PRIORITY_DESC') {
        const pA = PRIORITY_RANK[(a.priority ?? 'MEDIUM').toUpperCase()] ?? 2;
        const pB = PRIORITY_RANK[(b.priority ?? 'MEDIUM').toUpperCase()] ?? 2;
        return pB - pA;
      }
      if (sortBy === 'PRIORITY_ASC') {
        const pA = PRIORITY_RANK[(a.priority ?? 'MEDIUM').toUpperCase()] ?? 2;
        const pB = PRIORITY_RANK[(b.priority ?? 'MEDIUM').toUpperCase()] ?? 2;
        return pA - pB;
      }
      if (sortBy === 'DUE_DATE') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (sortBy === 'TITLE') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'STATUS') {
        const sA = a.customStatus?.name ?? '';
        const sB = b.customStatus?.name ?? '';
        return sA.localeCompare(sB);
      }
      return 0;
    });
  }, [sortBy]);

  const activeOrPlannedSprints = useMemo(
    () => sprints.filter(s => s.status !== 'COMPLETED'),
    [sprints]
  );

  const activeSprint = useMemo(
    () => sprints.find(s => s.status === 'ACTIVE') || null,
    [sprints]
  );

  const completedSprints = useMemo(
    () => sprints.filter(s => s.status === 'COMPLETED'),
    [sprints]
  );

  const filteredSprints = useMemo(
    () => activeOrPlannedSprints.map(s => ({ ...s, tasks: (s.tasks ?? []).filter(filterTask) })),
    [activeOrPlannedSprints, filterTask]
  );
  const filteredBacklog = useMemo(() => backlogTasks.filter(filterTask), [backlogTasks, filterTask]);

  const sortedSprints = useMemo(
    () => filteredSprints.map(s => ({ ...s, tasks: sortTasks(s.tasks ?? []) })),
    [filteredSprints, sortTasks]
  );
  const sortedBacklog = useMemo(() => sortTasks(filteredBacklog), [filteredBacklog, sortTasks]);

  const allVisibleTasks = useMemo(() => {
    const list: TaskPublic[] = [];
    sortedSprints.forEach(s => list.push(...(s.tasks ?? [])));
    list.push(...sortedBacklog);
    return list;
  }, [sortedSprints, sortedBacklog]);

  const handleToggleSelectTask = useCallback((taskId: string, isShiftKey?: boolean) => {
    setSelectedTaskIds(prev => {
      const isSelected = prev.includes(taskId);
      if (isShiftKey && lastSelectedIdRef.current && lastSelectedIdRef.current !== taskId) {
        const idx1 = allVisibleTasks.findIndex(t => t.id === lastSelectedIdRef.current);
        const idx2 = allVisibleTasks.findIndex(t => t.id === taskId);
        if (idx1 !== -1 && idx2 !== -1) {
          const start = Math.min(idx1, idx2);
          const end = Math.max(idx1, idx2);
          const rangeIds = allVisibleTasks.slice(start, end + 1).map(t => t.id);
          const set = new Set([...prev, ...rangeIds]);
          return Array.from(set);
        }
      }
      lastSelectedIdRef.current = taskId;
      return isSelected ? prev.filter(id => id !== taskId) : [...prev, taskId];
    });
  }, [allVisibleTasks]);

  const handleToggleSectionTasks = useCallback((taskIds: string[], selectAll: boolean) => {
    setSelectedTaskIds(prev => {
      if (selectAll) {
        const set = new Set([...prev, ...taskIds]);
        return Array.from(set);
      } else {
        return prev.filter(id => !taskIds.includes(id));
      }
    });
  }, []);

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

  const bulkMoveMutation = useMutation({
    mutationFn: async ({ taskIds, sprintId }: { taskIds: string[]; sprintId: string | null }) => {
      for (const taskId of taskIds) {
        await TasksService.Tasks_tasksUpdateTask({ taskId, requestBody: { sprintId } });
      }
    },
    onSuccess: (_, { sprintId, taskIds }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      setSelectedTaskIds([]);
      const targetName = sprintId ? (sprints.find(s => s.id === sprintId)?.name || 'sprint') : 'backlog';
      toast.success(`Đã chuyển ${taskIds.length} công việc sang ${targetName}`);
    },
    onError: () => {
      toast.error('Không thể di chuyển các task đã chọn');
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      for (const cardId of taskIds) {
        await CardsService.Cards_cardsDeleteCard({ cardId });
      }
    },
    onSuccess: (_, taskIds) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      setSelectedTaskIds([]);
      setShowBulkDeleteConfirm(false);
      toast.success(`Đã xóa thành công ${taskIds.length} công việc`);
    },
    onError: () => {
      toast.error('Không thể xóa các task đã chọn');
      setShowBulkDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
    },
  });

  const [isDraggingMulti, setIsDraggingMulti] = useState(false);

  const onDragStart = (start: any) => {
    if (selectedTaskIds.length > 1 && selectedTaskIds.includes(start.draggableId)) {
      setIsDraggingMulti(true);
    }
  };

  function onDragEnd(result: DropResult) {
    setIsDraggingMulti(false);
    const { draggableId, destination, source } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const destId = destination.droppableId;
    const newSprintId = destId === 'backlog' ? null : destId.replace('sprint:', '');

    // If multiple tasks are selected and user drags one of them, move ALL selected tasks!
    const targetTaskIds = selectedTaskIds.includes(draggableId) && selectedTaskIds.length > 1
      ? selectedTaskIds
      : [draggableId];

    if (targetTaskIds.length > 1) {
      bulkMoveMutation.mutate({ taskIds: targetTaskIds, sprintId: newSprintId });
      return;
    }

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
        {/* Header row with Title & Prominent Completed Sprints Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--trella-text)', margin: 0 }}>Backlog</h1>

          <button
            onClick={() => setShowCompletedModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              backgroundColor: 'rgba(0, 82, 204, 0.08)',
              border: '1px solid rgba(0, 82, 204, 0.25)',
              color: '#0052CC',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0, 82, 204, 0.08)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 82, 204, 0.15)';
              e.currentTarget.style.borderColor = '#0052CC';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 82, 204, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(0, 82, 204, 0.25)';
            }}
          >
            <span style={{ fontSize: 14 }}>🏆</span>
            <span>Completed Sprints</span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: '#0052CC',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {completedSprints.length}
            </span>
          </button>
        </div>

        {/* Toolbar row */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 220 }}>
            <Textfield
              value={search}
              onChange={e => setSearch((e.target as HTMLInputElement).value)}
              placeholder="Search backlog"
              aria-label="Search backlog"
            />
          </div>

          {/* Member Avatars */}
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

          {/* Filter Popover Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowFilterMenu(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: activeFilterCount > 0 ? '1px solid #1D7AFC' : '1px solid var(--trella-border)',
                backgroundColor: activeFilterCount > 0 ? 'rgba(29,122,252,0.1)' : 'var(--trella-surface)',
                color: activeFilterCount > 0 ? '#1D7AFC' : 'var(--trella-text)',
              }}
            >
              <FilterIcon label="Filter" size="small" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span style={{
                  padding: '1px 6px',
                  borderRadius: 10,
                  backgroundColor: '#1D7AFC',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {showFilterMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  zIndex: 200,
                  width: 260,
                  backgroundColor: 'var(--trella-surface, #ffffff)',
                  border: '1px solid var(--trella-border, #e2e8f0)',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(9, 30, 66, 0.18)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--trella-text)' }}>Filter Tasks</span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => {
                        setMemberFilter(null);
                        setStatusFilter(null);
                        setPriorityFilter(null);
                        setTypeFilter(null);
                      }}
                      style={{ background: 'none', border: 'none', color: '#0052CC', fontSize: 12, cursor: 'pointer', fontWeight: 600, padding: 0 }}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Filter by Status */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--trella-text-subtle)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Status
                  </label>
                  <select
                    value={statusFilter ?? ''}
                    onChange={e => setStatusFilter(e.target.value || null)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--trella-border)', fontSize: 13, backgroundColor: 'var(--trella-surface)', color: 'var(--trella-text)' }}
                  >
                    <option value="">All Statuses</option>
                    {customStatuses.map(cs => (
                      <option key={cs.id} value={cs.id}>{cs.name}</option>
                    ))}
                  </select>
                </div>

                {/* Filter by Priority */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--trella-text-subtle)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Priority
                  </label>
                  <select
                    value={priorityFilter ?? ''}
                    onChange={e => setPriorityFilter(e.target.value || null)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--trella-border)', fontSize: 13, backgroundColor: 'var(--trella-surface)', color: 'var(--trella-text)' }}
                  >
                    <option value="">All Priorities</option>
                    <option value="URGENT">Urgent</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                {/* Filter by Type */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--trella-text-subtle)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Work Type
                  </label>
                  <select
                    value={typeFilter ?? ''}
                    onChange={e => setTypeFilter(e.target.value || null)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--trella-border)', fontSize: 13, backgroundColor: 'var(--trella-surface)', color: 'var(--trella-text)' }}
                  >
                    <option value="">All Types</option>
                    <option value="TASK">Task</option>
                    <option value="BUG">Bug</option>
                    <option value="STORY">Story</option>
                    <option value="EPIC">Epic</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Sort By Dropdown */}
          <div style={{ position: 'relative' }}>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{
                height: 32,
                padding: '0 10px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: sortBy !== 'MANUAL' ? '1px solid #1D7AFC' : '1px solid var(--trella-border)',
                backgroundColor: sortBy !== 'MANUAL' ? 'rgba(29,122,252,0.1)' : 'var(--trella-surface)',
                color: sortBy !== 'MANUAL' ? '#1D7AFC' : 'var(--trella-text)',
                outline: 'none',
              }}
            >
              <option value="MANUAL">⇅ Sắp xếp: Mặc định (Kéo thả)</option>
              <option value="PRIORITY_DESC">🔥 Sắp xếp: Độ ưu tiên (Cao → Thấp)</option>
              <option value="PRIORITY_ASC">🧊 Sắp xếp: Độ ưu tiên (Thấp → Cao)</option>
              <option value="DUE_DATE">📅 Sắp xếp: Hạn chót</option>
              <option value="TITLE">🔤 Sắp xếp: Tên công việc (A - Z)</option>
              <option value="STATUS">🏷️ Sắp xếp: Trạng thái</option>
            </select>
          </div>

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
          <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
               {sortedSprints.map(sprint => (
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
                  selectedTaskIds={selectedTaskIds}
                  onToggleSelectTask={handleToggleSelectTask}
                  onToggleSectionTasks={handleToggleSectionTasks}
                  onMoveSelectedToBacklog={() => {
                    const sprintTaskIds = (sprint.tasks ?? []).map(t => t.id).filter(id => selectedTaskIds.includes(id));
                    const targetIds = sprintTaskIds.length > 0 ? sprintTaskIds : selectedTaskIds;
                    bulkMoveMutation.mutate({ taskIds: targetIds, sprintId: null });
                  }}
                  onDeleteSelected={() => {
                    setShowBulkDeleteConfirm(true);
                  }}
                  isDraggingMulti={isDraggingMulti}
                />
              ))}
              <BacklogSection
                tasks={sortedBacklog}
                projectId={resolvedProjectId}
                workspaceId={workspaceId}
                members={members}
                customStatuses={customStatuses}
                onTaskClick={id => setSelectedTaskId(id)}
                onCreateSprint={() => createSprintMutation.mutate()}
                boardId={firstBoardId ?? ''}
                todoColumnId={todoColumnId}
                transitions={workflowDetailQuery.data?.transitions || []}
                selectedTaskIds={selectedTaskIds}
                onToggleSelectTask={handleToggleSelectTask}
                onToggleSectionTasks={handleToggleSectionTasks}
                onMoveSelectedToActive={() => {
                  if (!activeSprint) return;
                  const backlogTaskIds = sortedBacklog.map(t => t.id).filter(id => selectedTaskIds.includes(id));
                  const targetIds = backlogTaskIds.length > 0 ? backlogTaskIds : selectedTaskIds;
                  bulkMoveMutation.mutate({ taskIds: targetIds, sprintId: activeSprint.id });
                }}
                onDeleteSelected={() => {
                  setShowBulkDeleteConfirm(true);
                }}
                activeSprintName={activeSprint?.name}
                isDraggingMulti={isDraggingMulti}
              />
            </div>
          </DragDropContext>
        )}
      </div>

      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        title={`Xóa ${selectedTaskIds.length} công việc đã chọn`}
        appearance="danger"
        confirmLabel={`Xóa ${selectedTaskIds.length} công việc`}
        confirmLoading={bulkDeleteMutation.isPending}
        onConfirm={() => bulkDeleteMutation.mutate(selectedTaskIds)}
        onClose={() => setShowBulkDeleteConfirm(false)}
        body={
          <p style={{ margin: 0, fontSize: 14 }}>
            Bạn có chắc chắn muốn xóa <strong>{selectedTaskIds.length} công việc</strong> đã chọn không? Thao tác này không thể hoàn tác.
          </p>
        }
      />

      {showInsights && resolvedProjectId && (
        <InsightsPanel projectId={resolvedProjectId} sprints={sprints} onClose={() => setShowInsights(false)} />
      )}

      {showCompletedModal && (
        <CompletedSprintsModal
          completedSprints={completedSprints}
          onClose={() => setShowCompletedModal(false)}
          onTaskClick={id => {
            setShowCompletedModal(false);
            setSelectedTaskId(id);
          }}
          members={members}
          customStatuses={customStatuses}
        />
      )}

      <TaskDetailDrawer open={!!selectedTaskId} onClose={closeTaskDrawer} task={selectedTask ?? null} workspaceId={workspaceId} projectMembers={members} columns={columns} />
    </div>
  );
}

