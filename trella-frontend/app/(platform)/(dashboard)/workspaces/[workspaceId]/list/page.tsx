'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ADS & Core Icons
import SearchIcon from '@atlaskit/icon/core/search';
import FilterIcon from '@atlaskit/icon/core/filter';
import { List as ListIcon, Columns as SplitIcon } from 'lucide-react';
import AddIcon from '@atlaskit/icon/core/add';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import TaskIcon from '@atlaskit/icon/core/task';
import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import SubtasksIcon from '@atlaskit/icon/core/subtasks';

// Services & Query Keys
import {
  BoardsService,
  ColumnsService,
  CustomStatusesService,
  ProjectMembersService,
  TasksService
} from '@/lib/client';
import type { TaskPublic, ProjectMemberPublic, ColumnPublic } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/components/providers/auth-provider';
import { useWorkspaceMode } from '@/lib/workspace-mode/use-workspace-mode';

// Sub-components — lazy loaded since they carry TipTap + @xyflow (~200kB), only needed when a task is opened
import dynamic from 'next/dynamic';

const LeftPanel = dynamic(
  () => import('@/components/task-detail-drawer').then(m => ({ default: m.LeftPanel })),
  { ssr: false }
);
const RightPanel = dynamic(
  () => import('@/components/task-detail-drawer').then(m => ({ default: m.RightPanel })),
  { ssr: false }
);

// Priorities Colors Mapping matching task detail
const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "#FF5630",
  HIGH: "#FF991F",
  MEDIUM: "#0052CC",
  LOW: "var(--trella-text-subtlest)",
};

const CANONICAL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#FFAB001A", text: "#FFAB00" },
  TODO: { bg: "var(--trella-border)", text: "var(--trella-text)" },
  IN_PROGRESS: { bg: "#0052CC1A", text: "#0052CC" },
  DONE: { bg: "#36B37E1A", text: "#36B37E" },
};

function getStatusStyle(cs: TaskPublic["customStatus"]): { bg: string; text: string } {
  if (!cs) return { bg: "var(--trella-border)", text: "var(--trella-text)" };
  const canonical = cs.canonicalStatus ?? "";
  if (CANONICAL_STATUS_COLORS[canonical]) return CANONICAL_STATUS_COLORS[canonical];
  const color = cs.color ?? "var(--trella-border)";
  return { bg: color + "1A", text: color };
}

function getTypeIcon(type: string | null | undefined) {
  switch (type) {
    case "BUG": return <BugIcon label="Bug" size="small" />;
    case "STORY": return <StoryIcon label="Story" size="small" />;
    case "SUBTASK": return <SubtasksIcon label="Subtask" size="small" />;
    default: return <TaskIcon label="Task" size="small" />;
  }
}

function getTypeColor(type: string | null | undefined): string {
  switch (type) {
    case "BUG": return "#FF5630";
    case "STORY": return "#64BA3B";
    case "SUBTASK": return "var(--trella-text-subtlest)";
    default: return "#0052CC";
  }
}

export default function WorkspaceListPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const workspaceId = params.workspaceId as string;

  // View States
  const [viewMode, setViewMode] = useState<'list' | 'split'>('list');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // Filtering States
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

  // Inline Creation State
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Mode verification (Scrum workspaces only)
  const workspaceModeQuery = useWorkspaceMode(workspaceId);
  const isScrum =
    workspaceModeQuery.data?.mode === 'SCRUM' ||
    (typeof window !== 'undefined' &&
      window.localStorage.getItem(`trella:projectType:${workspaceId}`) === 'scrum');

  useEffect(() => {
    if (workspaceModeQuery.isSuccess && !isScrum) {
      router.push(`/workspaces/${workspaceId}/boards`);
    }
  }, [workspaceModeQuery.isSuccess, isScrum, workspaceId, router]);

  // Fetch Boards
  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
  });
  const firstBoardId = boardsQuery.data?.[0]?.id ?? null;
  const projectId = boardsQuery.data?.[0]?.projectId ?? null;

  // Fetch Columns for tasks list & inline task creation
  const columnsQuery = useQuery({
    queryKey: queryKeys.boardColumns(firstBoardId ?? ''),
    queryFn: () => ColumnsService.Columns_columnsListColumns({ boardId: firstBoardId! }),
    enabled: !!firstBoardId,
  });
  const todoColumnId =
    columnsQuery.data?.find(c => c.statusKey === 'TODO')?.id ??
    columnsQuery.data?.[0]?.id ??
    '';

  // Fetch Board Tasks
  const tasksQuery = useQuery({
    queryKey: queryKeys.boardTasks(firstBoardId ?? ''),
    queryFn: () => BoardsService.Boards_boardsListBoardTasks({ boardId: firstBoardId! }),
    enabled: !!firstBoardId,
  });

  // Fetch Custom Statuses
  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId }),
  });
  const customStatuses = useMemo(() => customStatusesQuery.data ?? [], [customStatusesQuery.data]);

  // Fetch Members
  const projectMembersQuery = useQuery({
    queryKey: queryKeys.projectMembers(projectId ?? ''),
    queryFn: () => ProjectMembersService.ProjectMembers_projectMembersListMembers({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const members = useMemo(() => projectMembersQuery.data ?? [], [projectMembersQuery.data]);

  // Resolve actorNames mapping for task detail panel
  const actorNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      map[m.userId] = m.fullName || m.email;
    }
    return map;
  }, [members]);

  // Filter Tasks
  const filteredTasks = useMemo(() => {
    const all = tasksQuery.data ?? [];
    return all.filter(t => {
      // Don't show subtasks in the main list view directly
      if (t.parentId) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (memberFilter && t.assigneeId !== memberFilter) return false;
      if (statusFilter && t.customStatusId !== statusFilter) return false;
      return true;
    });
  }, [tasksQuery.data, search, memberFilter, statusFilter]);

  // Selected Task details for Split View
  const selectedTask = useMemo(() => {
    if (!selectedTaskId && filteredTasks.length > 0) {
      return filteredTasks[0];
    }
    return (tasksQuery.data ?? []).find(t => t.id === selectedTaskId) ?? null;
  }, [selectedTaskId, filteredTasks, tasksQuery.data]);

  useEffect(() => {
    if (viewMode === 'split' && !selectedTaskId && filteredTasks.length > 0) {
      setSelectedTaskId(filteredTasks[0].id);
    }
  }, [viewMode, selectedTaskId, filteredTasks]);

  // Inline Creation Mutation
  const createTaskMutation = useMutation({
    mutationFn: ({ title }: { title: string }) =>
      ColumnsService.Columns_columnsCreateTask({
        boardId: firstBoardId!,
        columnId: todoColumnId,
        requestBody: { title },
      }),
    onSuccess: (newTask) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(firstBoardId!) });
      toast.success('Task created successfully');
      setNewTaskTitle('');
      setIsCreating(false);
      if (viewMode === 'split') {
        setSelectedTaskId(newTask.id);
      }
    },
    onError: () => {
      toast.error('Failed to create task');
    },
  });

  const handleCreateTask = () => {
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    createTaskMutation.mutate({ title: trimmed });
  };

  const isLoading =
    workspaceModeQuery.isLoading ||
    boardsQuery.isLoading ||
    tasksQuery.isLoading ||
    customStatusesQuery.isLoading ||
    projectMembersQuery.isLoading;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--trella-text-subtlest)' }}>
        Loading task list...
      </div>
    );
  }

  if (!isScrum) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--trella-surface-sunken)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 24px',
        borderBottom: '1px solid var(--trella-border)',
        gap: 12,
        flexWrap: 'wrap',
        backgroundColor: 'var(--trella-surface)',
        flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--trella-border)', borderRadius: 4, padding: '0 8px', height: 32, backgroundColor: 'var(--trella-surface-sunken)' }}>
          <span style={{ color: 'var(--trella-text-subtlest)', display: 'flex' }}>
            <SearchIcon label="" size="small" />
          </span>
          <input
            placeholder="Search work"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'none', outline: 'none', color: 'var(--trella-text)', fontSize: 13, width: 160 }}
          />
        </div>

        {/* Member filter */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {members.slice(0, 5).map(m => {
            const isSelected = memberFilter === m.userId;
            return (
              <button
                key={m.userId}
                title={m.fullName ?? m.email}
                onClick={() => setMemberFilter(isSelected ? null : m.userId)}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  backgroundColor: isSelected ? '#579DFF' : '#0052CC',
                  border: isSelected ? '2px solid #1D7AFC' : '2px solid transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#fff', fontWeight: 600, padding: 0,
                }}
              >
                {m.fullName ? m.fullName.slice(0, 2).toUpperCase() : m.email.slice(0, 2).toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Status filter */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setStatusFilterOpen(v => !v)}
            style={{
              height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6,
              border: '1px solid var(--trella-border)', borderRadius: 4, backgroundColor: 'var(--trella-surface)',
              color: 'var(--trella-text-subtle)', fontSize: 13, cursor: 'pointer',
            }}
          >
            <FilterIcon label="" size="small" />
            {statusFilter ? customStatuses.find(s => s.id === statusFilter)?.name : 'Filter Status'}
            <ChevronDownIcon label="" size="small" />
          </button>
          {statusFilterOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setStatusFilterOpen(false)} />
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
                backgroundColor: 'var(--trella-surface-overlay)', border: '1px solid var(--trella-border)',
                borderRadius: 4, boxShadow: 'var(--trella-shadow-overlay)', minWidth: 160, overflow: 'hidden',
              }}>
                <div
                  onClick={() => { setStatusFilter(null); setStatusFilterOpen(false); }}
                  style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--trella-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  All Statuses
                </div>
                {customStatuses.map(s => (
                  <div
                    key={s.id}
                    onClick={() => { setStatusFilter(s.id); setStatusFilterOpen(false); }}
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--trella-text)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {s.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* View Mode Selectors */}
        <div style={{ display: 'flex', border: '1px solid var(--trella-border)', borderRadius: 4, overflow: 'hidden' }}>
          <button
            onClick={() => setViewMode('list')}
            title="List view"
            style={{
              height: 30, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: viewMode === 'list' ? 'var(--trella-surface-selected)' : 'var(--trella-surface)',
              cursor: 'pointer', borderRight: '1px solid var(--trella-border)',
              color: viewMode === 'list' ? 'var(--trella-brand)' : 'var(--trella-text-subtle)',
            }}
          >
            <ListIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('split')}
            title="Split view"
            style={{
              height: 30, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: viewMode === 'split' ? 'var(--trella-surface-selected)' : 'var(--trella-surface)',
              cursor: 'pointer',
              color: viewMode === 'split' ? 'var(--trella-brand)' : 'var(--trella-text-subtle)',
            }}
          >
            <SplitIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {viewMode === 'list' ? (
          /* List View (Table) */
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'var(--trella-surface)', borderRadius: 6, border: '1px solid var(--trella-border)', fontSize: 13, color: 'var(--trella-text)', minWidth: 800 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--trella-border)', backgroundColor: 'var(--trella-surface-sunken)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 16px', width: 40 }}><input type="checkbox" disabled /></th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Work</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Assignee</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Reporter</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Priority</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Resolution</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Created</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(t => {
                  const assignee = members.find(m => m.userId === t.assigneeId);
                  const statusStyle = getStatusStyle(t.customStatus);
                  const isDone = t.customStatus?.canonicalStatus === 'DONE';
                  const typeIcon = getTypeIcon(t.type);

                  return (
                    <tr
                      key={t.id}
                      onClick={() => { setSelectedTaskId(t.id); setViewMode('split'); }}
                      style={{ borderBottom: '1px solid var(--trella-border)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '10px 16px' }} onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: getTypeColor(t.type) }}>{typeIcon}</span>
                          <span style={{ color: 'var(--trella-text-subtle)', fontSize: 12, fontFamily: 'monospace' }}>{t.issueKey || t.id.slice(0, 8)}</span>
                          <span>{t.title}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {assignee ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#0052CC,#6554C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white' }}>
                              {assignee.fullName ? assignee.fullName.slice(0, 2).toUpperCase() : assignee.email.slice(0, 2).toUpperCase()}
                            </div>
                            <span>{assignee.fullName || assignee.email}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--trella-text-subtlest)' }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#0052CC,#6554C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white' }}>
                            {user?.fullName ? user.fullName.slice(0, 2).toUpperCase() : user?.email?.slice(0, 2).toUpperCase()}
                          </div>
                          <span>{user?.fullName || user?.email}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITY_COLORS[t.priority] || 'var(--trella-text-subtle)', backgroundColor: (PRIORITY_COLORS[t.priority] || 'var(--trella-text-subtle)') + '1A', padding: '2px 6px', borderRadius: 3 }}>
                          {t.priority}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: statusStyle.text, backgroundColor: statusStyle.bg, padding: '2px 6px', borderRadius: 3 }}>
                          {t.customStatus?.name || 'TODO'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: isDone ? 'var(--trella-text-success)' : 'var(--trella-text-subtle)' }}>
                        {isDone ? 'Done' : 'Unresolved'}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--trella-text-subtle)' }}>
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--trella-text-subtle)' }}>
                        {new Date(t.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Inline task creation button */}
            <div style={{ marginTop: 12 }}>
              {isCreating ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 400 }}>
                  <input
                    autoFocus
                    placeholder="What needs to be done?"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateTask();
                      if (e.key === 'Escape') setIsCreating(false);
                    }}
                    style={{ flex: 1, height: 32, padding: '0 8px', border: '1px solid var(--trella-brand)', borderRadius: 4, outline: 'none', fontSize: 13, backgroundColor: 'var(--trella-surface)', color: 'var(--trella-text)' }}
                  />
                  <button
                    onClick={handleCreateTask}
                    disabled={createTaskMutation.isPending || !newTaskTitle.trim()}
                    style={{ height: 32, padding: '0 12px', background: 'var(--trella-brand)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setIsCreating(false)}
                    style={{ height: 32, padding: '0 12px', background: 'none', border: '1px solid var(--trella-border)', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: 'var(--trella-text-subtle)' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--trella-brand)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: '6px 12px' }}
                >
                  <AddIcon label="" size="small" /> Create Task
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Split View Layout */
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Split Left List Panel */}
            <div style={{ width: 320, borderRight: '1px solid var(--trella-border)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--trella-surface)', overflowY: 'auto', flexShrink: 0 }}>
              {filteredTasks.map(t => {
                const isSelected = t.id === selectedTaskId;
                const statusStyle = getStatusStyle(t.customStatus);
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTaskId(t.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--trella-border)',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'var(--trella-surface-selected)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--trella-brand)' : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ color: getTypeColor(t.type) }}>{getTypeIcon(t.type)}</span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--trella-text-subtle)' }}>{t.issueKey || t.id.slice(0, 8)}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--trella-text)', marginBottom: 6 }}>
                      {t.title}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: statusStyle.text, backgroundColor: statusStyle.bg, padding: '1px 5px', borderRadius: 3 }}>
                        {t.customStatus?.name || 'TODO'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Inline task creation button (Split View) */}
              <div style={{ padding: '12px 16px' }}>
                {isCreating ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      autoFocus
                      placeholder="What needs to be done?"
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateTask();
                        if (e.key === 'Escape') setIsCreating(false);
                      }}
                      style={{ height: 32, padding: '0 8px', border: '1px solid var(--trella-brand)', borderRadius: 4, outline: 'none', fontSize: 13, backgroundColor: 'var(--trella-surface)', color: 'var(--trella-text)' }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={handleCreateTask}
                        disabled={createTaskMutation.isPending || !newTaskTitle.trim()}
                        style={{ height: 28, padding: '0 10px', background: 'var(--trella-brand)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setIsCreating(false)}
                        style={{ height: 28, padding: '0 10px', background: 'none', border: '1px solid var(--trella-border)', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: 'var(--trella-text-subtle)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsCreating(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--trella-brand)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                  >
                    <AddIcon label="" size="small" /> Create Task
                  </button>
                )}
              </div>
            </div>

            {/* Split Right Detail Panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--trella-surface)' }}>
              {selectedTask ? (
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                  <LeftPanel
                    task={selectedTask}
                    open={true}
                    actorNames={actorNames}
                    onSubtaskClick={(sub) => setSelectedTaskId(sub.id)}
                    onTaskUpdated={(updated) => {
                      queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(firstBoardId!) });
                    }}
                  />
                  <RightPanel
                    task={selectedTask}
                    projectMembers={members}
                    workspaceId={workspaceId}
                    onTaskUpdated={(updated) => {
                      queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(firstBoardId!) });
                    }}
                  />
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--trella-text-subtlest)', fontSize: 14 }}>
                  Select a task to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
