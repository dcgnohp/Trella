'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { token } from '@atlaskit/tokens';
import {
  PlansService,
  TasksService,
  WorkspaceMembersService,
  CustomStatusesService,
  BoardsService,
  type TaskPublic,
  type CustomStatusPublic,
  type WorkspaceMemberPublic,
} from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { TaskDetailDrawer } from '@/components/task-detail-drawer';
import { GanttChart } from './gantt-chart';
import { usePlanStaging, type StagedFields } from '../../_hooks/use-plan-staging';

// ADS Design Icons
import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import EpicIcon from '@atlaskit/icon/core/epic';
import TaskIcon from '@atlaskit/icon/core/task';
import BoardIcon from '@atlaskit/icon/core/board';
import PriorityHighestIcon from '@atlaskit/icon/core/priority-highest';
import PriorityHighIcon from '@atlaskit/icon/core/priority-high';
import PriorityLowIcon from '@atlaskit/icon/core/priority-low';
import PriorityMediumIcon from '@atlaskit/icon/core/priority-medium';

interface PlanTimelineClientProps {
  planId: string;
  workspaceId: string;
}

export function PlanTimelineClient({ planId, workspaceId }: PlanTimelineClientProps) {
  const queryClient = useQueryClient();
  const { stageChange, getEffectiveTask } = usePlanStaging();
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskPublic | null>(null);
  
  // Inline dropdown/edit states
  const [activeDropdownTaskId, setActiveDropdownTaskId] = useState<string | null>(null);
  const [activeDropdownType, setActiveDropdownType] = useState<'status' | 'assignee' | 'priority' | null>(null);
  const [editingDateTaskId, setEditingDateTaskId] = useState<string | null>(null);
  const [editingDateType, setEditingDateType] = useState<'start' | 'due' | null>(null);

  // Group expansion state (board IDs and parent task IDs)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Queries
  const epicsQuery = useQuery({
    queryKey: queryKeys.planEpics(planId),
    queryFn: () => PlansService.Plans_plansListEpicsForPlan({ planId }),
  });
  const rawEpics = useMemo(() => (epicsQuery.data ?? []) as unknown as TaskPublic[], [epicsQuery.data]);
  // Overlay staged edits so rows/bars show unsaved values immediately.
  const epics = useMemo(() => rawEpics.map(getEffectiveTask), [rawEpics, getEffectiveTask]);

  // Stage a field edit against the underlying (unstaged) task.
  const stageTask = (taskId: string, fields: StagedFields) => {
    const task = rawEpics.find(t => t.id === taskId);
    if (task) stageChange(task, fields);
  };

  const workspaceMembersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId }),
  });
  const workspaceMembers = workspaceMembersQuery.data ?? [];

  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId }),
  });
  const statuses = customStatusesQuery.data ?? [];

  const boardIds = useMemo(() => Array.from(new Set(epics.map(e => e.boardId))), [epics]);

  const boardQueries = useQueries({
    queries: boardIds.map(boardId => ({
      queryKey: queryKeys.board(boardId),
      queryFn: () => BoardsService.Boards_boardsGetBoard({ boardId }),
    })),
  });

  const boardsMap = useMemo(() => {
    const map: Record<string, { title: string }> = {};
    boardIds.forEach((boardId, i) => {
      map[boardId] = { title: boardQueries[i]?.data?.title ?? 'Board' };
    });
    return map;
  }, [boardIds, boardQueries]);

  // Project members mapped for TaskDetailDrawer
  const projectMembers = useMemo(() => {
    return workspaceMembers.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.email,
      fullName: m.fullName || null,
      avatarUrl: null,
      projectRole: m.role,
      status: m.status,
    }));
  }, [workspaceMembers]);

  // Edits stage into the plan (Jira sandbox model) rather than writing
  // immediately; they commit on "Save changes" in the plan header.
  const applyStaged = (taskId: string, fields: StagedFields) => {
    stageTask(taskId, fields);
    setActiveDropdownTaskId(null);
    setEditingDateTaskId(null);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Filter & Group tasks
  const filteredTasks = useMemo(() => {
    return epics.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [epics, searchQuery]);

  // Non-subtask items grouped by Board
  const groupedTasksByBoard = useMemo(() => {
    const map: Record<string, TaskPublic[]> = {};
    boardIds.forEach(id => {
      map[id] = [];
    });
    filteredTasks.forEach(e => {
      if (!e.parentId && map[e.boardId]) {
        map[e.boardId].push(e);
      }
    });
    return map;
  }, [boardIds, filteredTasks]);

  // Inline dropdown helper
  const handleOpenDropdown = (e: React.MouseEvent, taskId: string, type: 'status' | 'assignee' | 'priority') => {
    e.stopPropagation();
    if (activeDropdownTaskId === taskId && activeDropdownType === type) {
      setActiveDropdownTaskId(null);
      setActiveDropdownType(null);
    } else {
      setActiveDropdownTaskId(taskId);
      setActiveDropdownType(type);
    }
  };

  // Format date helper
  const formatD = (dStr?: string | null) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const getPriorityStyle = (priority?: string) => {
    switch (priority) {
      case 'URGENT':
        return {
          color: token('color.text.danger'),
          label: 'Urgent',
          icon: <PriorityHighestIcon label="Urgent" size="small" />
        };
      case 'HIGH':
        return {
          color: token('color.text.warning'),
          label: 'High',
          icon: <PriorityHighIcon label="High" size="small" />
        };
      case 'LOW':
        return {
          color: token('color.text.information'),
          label: 'Low',
          icon: <PriorityLowIcon label="Low" size="small" />
        };
      default:
        return {
          color: token('color.text.success'),
          label: 'Medium',
          icon: <PriorityMediumIcon label="Medium" size="small" />
        };
    }
  };

  const getStatusColor = (canonicalStatus?: string | null) => {
    switch (canonicalStatus) {
      case 'DONE':
        return { bg: token('color.background.success'), text: token('color.text.success') };
      case 'IN_PROGRESS':
        return { bg: token('color.background.information'), text: token('color.text.information') };
      default:
        return { bg: token('color.background.neutral'), text: token('color.text.subtle') };
    }
  };

  const renderTypeIcon = (type?: string) => {
    const iconStyle = { display: 'inline-flex', marginRight: 6, verticalAlign: 'middle' };
    switch (type) {
      case 'BUG':
        return <span style={iconStyle}><BugIcon label="Bug" size="small" /></span>;
      case 'STORY':
        return <span style={iconStyle}><StoryIcon label="Story" size="small" /></span>;
      case 'EPIC':
        return <span style={iconStyle}><EpicIcon label="Epic" size="small" /></span>;
      default:
        return <span style={iconStyle}><TaskIcon label="Task" size="small" /></span>;
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--ds-surface)', color: 'var(--ds-text)' }}>
      
      {/* Timeline view toolbar */}
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ds-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search timeline"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: 'var(--ds-surface-sunken)',
              border: '1px solid var(--ds-border)',
              borderRadius: 4,
              padding: '6px 12px',
              color: 'var(--ds-text)',
              fontSize: 13,
              outline: 'none',
              width: 180,
            }}
          />
          {['Filter', 'Basic view'].map(label => (
            <button
              key={label}
              style={{
                background: 'var(--ds-surface-sunken)',
                border: '1px solid var(--ds-border)',
                borderRadius: 4,
                padding: '6px 12px',
                color: 'var(--ds-text)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {label} <span style={{ fontSize: 9, color: 'var(--ds-text-subtle)' }}>▼</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Switcher style */}
          <div style={{ display: 'flex', background: 'var(--ds-surface-sunken)', border: '1px solid var(--ds-border)', borderRadius: 4, padding: 2 }}>
            <button
              onClick={() => setViewMode('timeline')}
              style={{
                background: viewMode === 'timeline' ? 'var(--ds-border)' : 'none',
                color: 'var(--ds-text)',
                border: 'none',
                borderRadius: 3,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                background: viewMode === 'list' ? 'var(--ds-border)' : 'none',
                color: 'var(--ds-text)',
                border: 'none',
                borderRadius: 3,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Main timeline/list panel */}
      {viewMode === 'list' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--ds-border)', color: 'var(--ds-text-subtle)', height: 40 }}>
                <th style={{ width: 30, paddingLeft: 12 }}></th>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 280 }}>Work item</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 140 }}>Assignee</th>
                <th style={{ width: 120 }}>Start date</th>
                <th style={{ width: 120 }}>Due date</th>
                <th style={{ width: 120 }}>Priority</th>
              </tr>
            </thead>
            <tbody>
              {boardIds.map(boardId => {
                const boardTitle = boardsMap[boardId]?.title || 'Workspace Board';
                const boardTasks = groupedTasksByBoard[boardId] || [];
                const isBoardExpanded = expandedGroups[boardId] !== false; // Default expanded

                return (
                  <React.Fragment key={boardId}>
                    {/* Board grouping header row */}
                    <tr style={{ background: 'var(--ds-surface-sunken)', borderBottom: '1px solid var(--ds-border)', height: 42 }}>
                      <td style={{ paddingLeft: 12 }}>
                        <button
                          onClick={() => toggleGroup(boardId)}
                          style={{ background: 'none', border: 'none', color: 'var(--ds-text-subtle)', cursor: 'pointer', fontSize: 11 }}
                        >
                          {isBoardExpanded ? '▼' : '▶'}
                        </button>
                      </td>
                      <td></td>
                      <td colSpan={6} style={{ fontWeight: 600, color: 'var(--ds-text)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BoardIcon label="Board" size="small" />
                            <span>{boardTitle}</span>
                          </div>
                          <span style={{ fontSize: 11, background: 'var(--ds-border)', color: 'var(--ds-text-subtle)', padding: '2px 6px', borderRadius: 999 }}>
                            {boardTasks.length} items
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Board tasks list */}
                    {isBoardExpanded && boardTasks.map((task, idx) => (
                      <TreeTaskRow
                        key={task.id}
                        task={task}
                        index={idx + 1}
                        depth={1}
                        statuses={statuses}
                        workspaceMembers={workspaceMembers}
                        activeDropdownTaskId={activeDropdownTaskId}
                        activeDropdownType={activeDropdownType}
                        editingDateTaskId={editingDateTaskId}
                        editingDateType={editingDateType}
                        expandedGroups={expandedGroups}
                        onToggleGroup={toggleGroup}
                        onOpenDropdown={handleOpenDropdown}
                        onSelectStatus={(sId) => applyStaged(task.id, { customStatusId: sId })}
                        onSelectAssignee={(aId) => applyStaged(task.id, { assigneeId: aId })}
                        onSelectPriority={(p) => applyStaged(task.id, { priority: p })}
                        onSelectDate={(d, dateType) => applyStaged(task.id, { [dateType === 'start' ? 'startDate' : 'dueDate']: d })}
                        setEditingDateTaskId={setEditingDateTaskId}
                        setEditingDateType={setEditingDateType}
                        onClickTask={() => setSelectedTask(task)}
                        getPriorityStyle={getPriorityStyle}
                        getStatusColor={getStatusColor}
                        renderTypeIcon={renderTypeIcon}
                        formatD={formatD}
                      />
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <GanttChart
            epics={epics as any}
            onEpicDateChange={(epicId, dates) => applyStaged(epicId, dates)}
          />
        </div>
      )}

      {/* Task detail drawer */}
      <TaskDetailDrawer
        open={!!selectedTask}
        onClose={() => {
          setSelectedTask(null);
          queryClient.invalidateQueries({ queryKey: queryKeys.planEpics(planId) });
        }}
        task={selectedTask}
        workspaceId={workspaceId}
        projectMembers={projectMembers}
      />
    </div>
  );
}

interface TreeTaskRowProps {
  task: TaskPublic;
  index: number;
  depth: number;
  statuses: CustomStatusPublic[];
  workspaceMembers: WorkspaceMemberPublic[];
  activeDropdownTaskId: string | null;
  activeDropdownType: 'status' | 'assignee' | 'priority' | null;
  editingDateTaskId: string | null;
  editingDateType: 'start' | 'due' | null;
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
  onOpenDropdown: (e: React.MouseEvent, taskId: string, type: 'status' | 'assignee' | 'priority') => void;
  onSelectStatus: (sId: string) => void;
  onSelectAssignee: (aId: string | null) => void;
  onSelectPriority: (p: string) => void;
  onSelectDate: (d: string | null, type: 'start' | 'due') => void;
  setEditingDateTaskId: (id: string | null) => void;
  setEditingDateType: (type: 'start' | 'due' | null) => void;
  onClickTask: () => void;
  getPriorityStyle: (p?: string) => { color: string; label: string; icon: React.ReactNode };
  getStatusColor: (canonicalStatus?: string | null) => { bg: string; text: string };
  renderTypeIcon: (type?: string) => React.ReactNode;
  formatD: (d?: string | null) => string;
}

function TreeTaskRow({
  task,
  index,
  depth,
  statuses,
  workspaceMembers,
  activeDropdownTaskId,
  activeDropdownType,
  editingDateTaskId,
  editingDateType,
  expandedGroups,
  onToggleGroup,
  onOpenDropdown,
  onSelectStatus,
  onSelectAssignee,
  onSelectPriority,
  onSelectDate,
  setEditingDateTaskId,
  setEditingDateType,
  onClickTask,
  getPriorityStyle,
  getStatusColor,
  renderTypeIcon,
  formatD,
}: TreeTaskRowProps) {
  const [hovered, setHovered] = useState(false);

  // Query subtasks dynamically
  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', task.id],
    queryFn: () => TasksService.Tasks_tasksListSubtasks({ taskId: task.id }),
    enabled: task.type === 'EPIC' || task.type === 'TASK' || task.type === 'STORY',
  });

  const isExpanded = expandedGroups[task.id] === true;
  const statusObj = statuses.find(s => s.id === task.customStatusId);
  const statusStyle = getStatusColor(statusObj?.canonicalStatus);

  const assignee = workspaceMembers.find(m => m.userId === task.assigneeId);
  const assigneeName = assignee ? assignee.fullName || assignee.email : 'Unassigned';

  const priorityStyle = getPriorityStyle(task.priority);

  return (
    <>
      <tr
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderBottom: '1px solid var(--ds-border)',
          height: 40,
          background: hovered ? 'var(--ds-surface-raised)' : 'transparent',
          transition: 'background 0.1s ease',
        }}
      >
        {/* Toggle subtasks */}
        <td style={{ paddingLeft: 12 }}>
          {subtasks.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleGroup(task.id);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--ds-text-subtle)', cursor: 'pointer', fontSize: 10 }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
        </td>

        {/* Index */}
        <td style={{ color: 'var(--ds-text-subtlest)' }}>{index}</td>

        {/* Work item key + title */}
        <td>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: (depth - 1) * 20 }}>
            {renderTypeIcon(task.type)}
            <span
              onClick={onClickTask}
              style={{
                fontSize: 12,
                color: 'var(--ds-link)',
                fontWeight: 600,
                marginRight: 8,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {task.issueKey || `TSK-${task.position}`}
            </span>
            <span
              onClick={onClickTask}
              style={{
                color: 'var(--ds-text)',
                cursor: 'pointer',
                fontWeight: 500,
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}
            >
              {task.title}
            </span>
          </div>
        </td>

        {/* Status Dropdown */}
        <td style={{ position: 'relative' }}>
          <button
            onClick={e => onOpenDropdown(e, task.id, 'status')}
            style={{
              background: statusStyle.bg,
              color: statusStyle.text,
              border: 'none',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {statusObj?.name || 'TODO'} <span style={{ fontSize: 7 }}>▼</span>
          </button>

          {activeDropdownTaskId === task.id && activeDropdownType === 'status' && (
            <DropdownList
              options={statuses.map(s => ({ label: s.name, value: s.id }))}
              onSelect={onSelectStatus}
              onClose={() => onOpenDropdown({} as any, task.id, 'status')}
            />
          )}
        </td>

        {/* Assignee Dropdown */}
        <td style={{ position: 'relative' }}>
          <div
            onClick={e => onOpenDropdown(e, task.id, 'assignee')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: assignee ? token('color.background.brand.bold') : token('color.background.neutral'),
                color: assignee ? token('color.text.inverse') : token('color.text.subtle'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              {assignee ? assigneeName.charAt(0).toUpperCase() : '?'}
            </div>
            <span style={{ fontSize: 13, color: 'var(--ds-text)' }}>{assigneeName}</span>
          </div>

          {activeDropdownTaskId === task.id && activeDropdownType === 'assignee' && (
            <DropdownList
              options={[
                { label: 'Unassigned', value: null },
                ...workspaceMembers.map(m => ({ label: m.fullName || m.email, value: m.userId })),
              ]}
              onSelect={onSelectAssignee}
              onClose={() => onOpenDropdown({} as any, task.id, 'assignee')}
            />
          )}
        </td>

        {/* Start Date */}
        <td>
          {editingDateTaskId === task.id && editingDateType === 'start' ? (
            <input
              type="date"
              autoFocus
              defaultValue={task.startDate ? task.startDate.slice(0, 10) : ''}
              onBlur={e => {
                onSelectDate(e.target.value || null, 'start');
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setEditingDateTaskId(null);
                  setEditingDateType(null);
                }
              }}
              style={{
                background: 'var(--ds-surface-sunken)',
                border: '1px solid var(--ds-border)',
                color: 'var(--ds-text)',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 12,
                outline: 'none',
              }}
            />
          ) : (
            <span
              onClick={() => {
                setEditingDateTaskId(task.id);
                setEditingDateType('start');
              }}
              style={{ cursor: 'pointer', borderBottom: '1px dashed var(--ds-border)' }}
            >
              {formatD(task.startDate) || 'Set date'}
            </span>
          )}
        </td>

        {/* Due Date */}
        <td>
          {editingDateTaskId === task.id && editingDateType === 'due' ? (
            <input
              type="date"
              autoFocus
              defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ''}
              onBlur={e => {
                onSelectDate(e.target.value || null, 'due');
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setEditingDateTaskId(null);
                  setEditingDateType(null);
                }
              }}
              style={{
                background: 'var(--ds-surface-sunken)',
                border: '1px solid var(--ds-border)',
                color: 'var(--ds-text)',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 12,
                outline: 'none',
              }}
            />
          ) : (
            <span
              onClick={() => {
                setEditingDateTaskId(task.id);
                setEditingDateType('due');
              }}
              style={{ cursor: 'pointer', borderBottom: '1px dashed var(--ds-border)' }}
            >
              {formatD(task.dueDate) || 'Set date'}
            </span>
          )}
        </td>

        {/* Priority Dropdown */}
        <td style={{ position: 'relative' }}>
          <div
            onClick={e => onOpenDropdown(e, task.id, 'priority')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>{priorityStyle.icon}</span>
            <span style={{ fontSize: 13, color: 'var(--ds-text)' }}>{priorityStyle.label}</span>
          </div>

          {activeDropdownTaskId === task.id && activeDropdownType === 'priority' && (
            <DropdownList
              options={[
                { label: 'Low', value: 'LOW' },
                { label: 'Medium', value: 'MEDIUM' },
                { label: 'High', value: 'HIGH' },
                { label: 'Urgent', value: 'URGENT' },
              ]}
              onSelect={onSelectPriority}
              onClose={() => onOpenDropdown({} as any, task.id, 'priority')}
            />
          )}
        </td>
      </tr>

      {/* Render subtasks recursively */}
      {isExpanded && subtasks.map((sub, sIdx) => (
        <TreeTaskRow
          key={sub.id}
          task={sub}
          index={sIdx + 1}
          depth={depth + 1}
          statuses={statuses}
          workspaceMembers={workspaceMembers}
          activeDropdownTaskId={activeDropdownTaskId}
          activeDropdownType={activeDropdownType}
          editingDateTaskId={editingDateTaskId}
          editingDateType={editingDateType}
          expandedGroups={expandedGroups}
          onToggleGroup={onToggleGroup}
          onOpenDropdown={onOpenDropdown}
          onSelectStatus={onSelectStatus}
          onSelectAssignee={onSelectAssignee}
          onSelectPriority={onSelectPriority}
          onSelectDate={onSelectDate}
          setEditingDateTaskId={setEditingDateTaskId}
          setEditingDateType={setEditingDateType}
          onClickTask={() => onClickTask()}
          getPriorityStyle={getPriorityStyle}
          getStatusColor={getStatusColor}
          renderTypeIcon={renderTypeIcon}
          formatD={formatD}
        />
      ))}
    </>
  );
}

interface DropdownListProps {
  options: { label: string; value: string | null }[];
  onSelect: (val: any) => void;
  onClose: () => void;
}

function DropdownList({ options, onSelect, onClose }: DropdownListProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        zIndex: 500,
        background: 'var(--ds-surface-sunken)',
        border: '1px solid var(--ds-border)',
        borderRadius: 4,
        boxShadow: token('elevation.shadow.overlay'),
        minWidth: 160,
        overflow: 'hidden',
      }}
    >
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => {
            onSelect(opt.value);
            onClose();
          }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--ds-text)',
            cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--ds-border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
