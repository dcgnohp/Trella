'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { token } from '@atlaskit/tokens';
import PageHeader from '@atlaskit/page-header';
import Lozenge from '@atlaskit/lozenge';
import {
  PlansService,
  SprintsService,
  WorkspaceMembersService,
  CustomStatusesService,
  type TaskPublic,
  type CustomStatusPublic,
} from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { TaskDetailDrawer } from '@/components/task-detail-drawer';
import { usePlanStaging } from '../../_hooks/use-plan-staging';

interface PlanProgramClientProps {
  planId: string;
  workspaceId: string;
}

type LozengeAppearance = 'default' | 'inprogress' | 'success' | 'removed' | 'moved' | 'new';

function statusAppearance(canonical?: string | null): LozengeAppearance {
  switch (canonical) {
    case 'DONE':
      return 'success';
    case 'IN_PROGRESS':
      return 'inprogress';
    default:
      return 'default';
  }
}

export function PlanProgramClient({ planId, workspaceId }: PlanProgramClientProps) {
  const queryClient = useQueryClient();
  const { stageChange, getEffectiveTask, isStaged } = usePlanStaging();

  const [selectedTask, setSelectedTask] = useState<TaskPublic | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Queries
  const epicsQuery = useQuery({
    queryKey: queryKeys.planEpics(planId),
    queryFn: () => PlansService.Plans_plansListEpicsForPlan({ planId }),
  });
  const rawEpics = useMemo(() => (epicsQuery.data ?? []) as unknown as TaskPublic[], [epicsQuery.data]);
  // Overlay staged edits so drags reflect immediately without a write.
  const epics = useMemo(() => rawEpics.map(getEffectiveTask), [rawEpics, getEffectiveTask]);

  const sprintsQuery = useQuery({
    queryKey: ['workspace-sprints', workspaceId],
    queryFn: () => SprintsService.Sprints_sprintsListWorkspaceSprints({ workspaceId }),
  });
  const sprints = useMemo(() => {
    const list = sprintsQuery.data ?? [];
    return [...list].sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });
  }, [sprintsQuery.data]);

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

  const filteredTasks = useMemo(() => {
    return epics.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [epics, searchQuery]);

  const backlogTasks = useMemo(() => filteredTasks.filter(e => !e.sprintId), [filteredTasks]);

  const sprintTasksMap = useMemo(() => {
    const map: Record<string, TaskPublic[]> = {};
    sprints.forEach(s => { map[s.id] = []; });
    filteredTasks.forEach(e => {
      if (e.sprintId && map[e.sprintId]) map[e.sprintId].push(e);
    });
    return map;
  }, [sprints, filteredTasks]);

  // Drag & drop — STAGE the change instead of writing immediately.
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent, sprintId: string | null) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = rawEpics.find(t => t.id === taskId);
    if (!task) return;

    // Dropping into a sprint sets the sprint + aligns the item's dates to the
    // sprint window (Jira Program board behaviour). Dropping in the backlog
    // clears the sprint. Either way it is only staged until "Save changes".
    if (sprintId) {
      const sprint = sprints.find(s => s.id === sprintId);
      stageChange(task, {
        sprintId,
        startDate: sprint?.startDate ?? task.startDate ?? null,
        dueDate: sprint?.endDate ?? task.dueDate ?? null,
      });
    } else {
      stageChange(task, { sprintId: null });
    }
  };

  const renderTypeIcon = (type?: string) => {
    switch (type) {
      case 'BUG':
        return <span style={{ fontSize: 12, marginRight: 4 }}>🐞</span>;
      case 'STORY':
        return <span style={{ fontSize: 12, marginRight: 4 }}>🟢</span>;
      case 'EPIC':
        return <span style={{ fontSize: 12, marginRight: 4 }}>🟣</span>;
      default:
        return <span style={{ fontSize: 12, marginRight: 4 }}>🟦</span>;
    }
  };

  const formatD = (dStr?: string | null) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: token('elevation.surface'), color: token('color.text') }}>

      {/* Header toolbar */}
      <div style={{
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${token('color.border')}`,
        flexShrink: 0,
      }}>
        <PageHeader>Program</PageHeader>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            placeholder="Search board"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: token('elevation.surface.sunken'),
              border: `1px solid ${token('color.border')}`,
              borderRadius: 4,
              padding: '6px 12px',
              color: token('color.text'),
              fontSize: 13,
              outline: 'none',
              width: 200,
            }}
          />
        </div>
      </div>

      {/* Board layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Backlog panel */}
        <div
          onDragOver={handleDragOver}
          onDrop={e => handleDrop(e, null)}
          style={{
            width: 300,
            flexShrink: 0,
            borderRight: `1px solid ${token('color.border')}`,
            display: 'flex',
            flexDirection: 'column',
            background: token('elevation.surface.sunken'),
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${token('color.border')}` }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: token('color.text') }}>Drag work items to schedule</h3>
            <p style={{ fontSize: 11, color: token('color.text.subtle'), margin: '4px 0 0' }}>
              {backlogTasks.length} work item{backlogTasks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {backlogTasks.length === 0 ? (
              <div style={{
                padding: 20,
                textAlign: 'center',
                color: token('color.text.subtlest'),
                border: `1px dashed ${token('color.border')}`,
                borderRadius: 4,
                fontSize: 13,
              }}>
                No unscheduled items
              </div>
            ) : (
              backlogTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  statuses={statuses}
                  members={workspaceMembers}
                  modified={isStaged(task.id)}
                  onDragStart={handleDragStart}
                  onClick={() => setSelectedTask(rawEpics.find(t => t.id === task.id) ?? task)}
                  renderTypeIcon={renderTypeIcon}
                />
              ))
            )}
          </div>
        </div>

        {/* Sprint columns */}
        <div style={{ flex: 1, overflowX: 'auto', display: 'flex', background: token('elevation.surface') }}>
          {sprints.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: token('color.text.subtle'), fontSize: 14, padding: 24, textAlign: 'center' }}>
              No sprints in this workspace. Create sprints in the Backlog to schedule work here.
            </div>
          ) : (
            sprints.map((sprint, idx) => {
              const dateRange = sprint.startDate ? `#${idx + 1} (${formatD(sprint.startDate)} – ${formatD(sprint.endDate)})` : sprint.name;
              const tasks = sprintTasksMap[sprint.id] || [];
              return (
                <div
                  key={sprint.id}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, sprint.id)}
                  style={{
                    width: 280,
                    flexShrink: 0,
                    borderRight: `1px solid ${token('color.border')}`,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ padding: '14px 18px', borderBottom: `1px solid ${token('color.border')}`, background: token('elevation.surface.sunken') }}>
                    <h3 style={{ fontSize: 12, fontWeight: 600, color: token('color.text'), margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {dateRange}
                    </h3>
                    <p style={{ fontSize: 10, color: token('color.text.subtle'), margin: '4px 0 0' }}>
                      {tasks.length} work item{tasks.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        statuses={statuses}
                        members={workspaceMembers}
                        modified={isStaged(task.id)}
                        onDragStart={handleDragStart}
                        onClick={() => setSelectedTask(rawEpics.find(t => t.id === task.id) ?? task)}
                        renderTypeIcon={renderTypeIcon}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

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

interface TaskCardProps {
  task: TaskPublic;
  statuses: CustomStatusPublic[];
  members: any[];
  modified: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: () => void;
  renderTypeIcon: (type?: string) => React.ReactNode;
}

function TaskCard({ task, statuses, members, modified, onDragStart, onClick, renderTypeIcon }: TaskCardProps) {
  const [hovered, setHovered] = useState(false);
  const statusObj = statuses.find(s => s.id === task.customStatusId);
  const assignee = members.find(m => m.userId === task.assigneeId);
  const assigneeInitial = assignee ? (assignee.fullName || assignee.email).charAt(0).toUpperCase() : '?';

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: token('elevation.surface.raised'),
        border: `1px solid ${modified ? token('color.border.warning') : hovered ? token('color.border.brand') : token('color.border')}`,
        borderLeft: modified ? `3px solid ${token('color.border.warning')}` : undefined,
        borderRadius: 4,
        padding: '12px 14px',
        cursor: 'grab',
        position: 'relative',
        boxShadow: hovered ? token('elevation.shadow.raised') : 'none',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onClick(); }}
          style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: token('color.icon.subtle'), cursor: 'pointer', fontSize: 12, padding: 2 }}
          title="Edit details"
        >
          ✏️
        </button>
      )}

      <div onClick={onClick} style={{ fontSize: 13, fontWeight: 500, color: token('color.text'), marginBottom: 10, paddingRight: 16 }}>
        {task.title}
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lozenge appearance={statusAppearance(statusObj?.canonicalStatus)}>
          {statusObj?.name || 'To Do'}
        </Lozenge>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {renderTypeIcon(task.type)}
          <span style={{ fontSize: 11, color: token('color.text.subtle'), fontWeight: 600 }}>
            {task.issueKey || `TSK-${task.position}`}
          </span>
          {task.storyPoint != null && (
            <span style={{ fontSize: 10, color: token('color.text.warning'), background: token('color.background.warning'), padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
              {task.storyPoint} SP
            </span>
          )}
        </div>
        <div
          title={assignee ? assignee.fullName || assignee.email : 'Unassigned'}
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
          {assigneeInitial}
        </div>
      </div>
    </div>
  );
}
