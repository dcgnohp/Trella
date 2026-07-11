'use client';

import React, { useRef, useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { format, isPast, parseISO } from 'date-fns';
import TaskIcon from '@atlaskit/icon/core/task';
import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import SubtasksIcon from '@atlaskit/icon/core/subtasks';
import CalendarIcon from '@atlaskit/icon/core/calendar';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { TasksService, ApiError } from '@/lib/client';
import type { TaskPublic, ProjectMemberPublic, CustomStatusPublic, SprintWithTasks } from '@/lib/client';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import * as ReactDOM from 'react-dom';

const WORK_TYPE_ICON: Record<string, React.ReactNode> = {
  TASK: <span style={{ color: '#0052CC' }}><TaskIcon label="Task" size="small" /></span>,
  BUG: <span style={{ color: '#FF5630' }}><BugIcon label="Bug" size="small" /></span>,
  STORY: <span style={{ color: '#64BA3B' }}><StoryIcon label="Story" size="small" /></span>,
  SUBTASK: <span style={{ color: 'var(--trella-text-subtlest)' }}><SubtasksIcon label="Subtask" size="small" /></span>,
};

function getWorkTypeIcon(task: TaskPublic) {
  return WORK_TYPE_ICON[(task.type ?? 'TASK').toUpperCase()] ?? WORK_TYPE_ICON['TASK'];
}

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  TODO: { bg: '#8590A2', text: '#fff' },
  IN_PROGRESS: { bg: '#579DFF', text: '#fff' },
  DONE: { bg: '#4CAF50', text: '#fff' },
  PENDING: { bg: '#FFAB00', text: '#000' },
};

const LOZENGE_COLORS: Record<string, { bg: string; text: string }> = {
  TODO: { bg: "#F4F5F7", text: "#42526E" },
  IN_PROGRESS: { bg: "#DEEBFF", text: "#0747A6" },
  DONE: { bg: "#E3FCEF", text: "#006644" },
  PENDING: { bg: "#FFF0B3", text: "#172B4D" },
};

interface TaskRowProps {
  task: TaskPublic;
  index: number;
  droppableId: string;
  members: ProjectMemberPublic[];
  customStatuses: CustomStatusPublic[];
  onTaskClick: (task: TaskPublic) => void;
  projectId: string;
  workspaceId: string;
  transitions?: any[];
}

export function TaskRow({ task, index, droppableId, members, customStatuses, onTaskClick, projectId, workspaceId, transitions = [] }: TaskRowProps) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const statusBadgeRef = useRef<HTMLSpanElement>(null);

  const canonical = (task.customStatus?.canonicalStatus ?? 'TODO').toUpperCase();
  const statusColors = STATUS_COLORS[canonical] ?? STATUS_COLORS['TODO'];
  const statusLabel = task.customStatus?.name ?? canonical;

  const assignee = members.find(m => m.userId === task.assigneeId);
  const isOverdue = task.dueDate ? isPast(parseISO(task.dueDate)) && canonical !== 'DONE' : false;
  const dueDateLabel = task.dueDate ? format(parseISO(task.dueDate), 'MMM d') : null;

  const updateStatusMutation = useMutation({
    mutationFn: ({ customStatusId, transitionComment }: { customStatusId: string; transitionComment?: string }) =>
      TasksService.Tasks_tasksUpdateTask({ taskId: task.id, requestBody: { customStatusId, transitionComment } }),
    onMutate: ({ customStatusId }) => {
      // Optimistic update: patch task in both sprint and backlog caches
      const newStatus = customStatuses.find(cs => cs.id === customStatusId);
      if (!newStatus) return;
      const patchTask = (t: TaskPublic) =>
        t.id === task.id ? { ...t, customStatusId, customStatus: newStatus } : t;

      queryClient.setQueryData<SprintWithTasks[]>(
        queryKeys.projectSprints(projectId),
        old => old?.map(s => ({ ...s, tasks: (s.tasks ?? []).map(patchTask) }))
      );
      queryClient.setQueryData<TaskPublic[]>(
        queryKeys.projectBacklog(projectId),
        old => old?.map(patchTask)
      );
      queryClient.setQueryData<SprintWithTasks[]>(
        queryKeys.workspaceSprints(workspaceId),
        old => old?.map(s => ({ ...s, tasks: (s.tasks ?? []).map(patchTask) }))
      );
      queryClient.setQueryData<TaskPublic[]>(
        queryKeys.workspaceBacklog(workspaceId),
        old => old?.map(patchTask)
      );
    },
    onError: (error: any, variables) => {
      let msg = 'Failed to update status';
      if (error instanceof ApiError) {
        const body = error.body as { detail?: string } | undefined;
        if (typeof body?.detail === 'string') {
          msg = body.detail;
        }
      }

      const currentStatus = customStatuses.find(s => s.id === task.customStatusId)?.name || 'Không rõ';
      const targetStatus = customStatuses.find(s => s.id === variables.customStatusId)?.name || 'Không rõ';

      if (msg === 'Invalid workflow transition path') {
        const validDestIds = transitions
          .filter(t => t.fromStatusId === task.customStatusId || t.fromStatusId === null)
          .map(t => t.toStatusId);
        const validStatuses = customStatuses
          .filter(s => validDestIds.includes(s.id))
          .map(s => s.name);
        
        const validListStr = validStatuses.length > 0 ? validStatuses.join(', ') : 'không có trạng thái nào';
        msg = `Không thể chuyển trạng thái từ "${currentStatus}" sang "${targetStatus}". Theo quy trình làm việc (Workflow) của dự án, từ "${currentStatus}" bạn chỉ có thể chuyển sang: ${validListStr}.`;
      }

      // If a comment is required, prompt the user directly via prompt dialog
      if (msg.includes('comment is required') || msg.toLowerCase().includes('bình luận')) {
        const comment = window.prompt('Quy trình Scrum yêu cầu viết bình luận giải trình để chuyển sang trạng thái này:');
        if (comment !== null && comment.trim() !== '') {
          // Retry mutation with comment
          updateStatusMutation.mutate({
            customStatusId: variables.customStatusId,
            transitionComment: comment,
          });
          return;
        }
      }

      toast.error(msg);

      queryClient.invalidateQueries({ queryKey: queryKeys.projectSprints(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectBacklog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSprints(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectBacklog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
    },
  });

  const openStatusDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (statusBadgeRef.current) {
      const r = statusBadgeRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, left: r.left });
    }
    setStatusDropdownOpen(true);
  };

  const statusPortal = statusDropdownOpen && dropdownPos && typeof document !== 'undefined' ? ReactDOM.createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setStatusDropdownOpen(false)} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: dropdownPos.top,
          left: dropdownPos.left,
          zIndex: 9999,
          backgroundColor: 'var(--trella-surface)',
          border: '1px solid var(--trella-border)',
          borderRadius: 4,
          boxShadow: '0 4px 16px rgba(9,30,66,0.18)',
          minWidth: 160,
          padding: '4px 0',
        }}
      >
        <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--trella-text-subtlest)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Change status
        </div>
        {(() => {
          const validDestIds = transitions
            .filter(t => t.fromStatusId === task.customStatusId || t.fromStatusId === null)
            .map(t => t.toStatusId);
          const validStatuses = customStatuses.filter(s => validDestIds.includes(s.id));
          const validListStr = validStatuses.map(s => s.name).join(', ');
          const isWorkflowActive = transitions.length > 0;

          return (
            <>
              {customStatuses.map(cs => {
                const colors = LOZENGE_COLORS[(cs.canonicalStatus ?? 'TODO').toUpperCase()] ?? LOZENGE_COLORS['TODO'];
                const isSelected = task.customStatusId === cs.id;
                const isValid = !isWorkflowActive || isSelected || validDestIds.includes(cs.id);

                return (
                  <div
                    key={cs.id}
                    onClick={() => {
                      if (!isValid) return;
                      updateStatusMutation.mutate({ customStatusId: cs.id });
                      setStatusDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px',
                      cursor: isValid ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      color: 'var(--trella-text)',
                      fontWeight: isSelected ? 600 : 400,
                      backgroundColor: isSelected ? 'var(--trella-surface-selected)' : 'transparent',
                      opacity: isValid ? 1 : 0.45,
                    }}
                    onMouseEnter={e => {
                      if (isValid && !isSelected) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--trella-surface-selected)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (isValid && !isSelected) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: colors.bg,
                        color: colors.text,
                        padding: "2px 6px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        display: "inline-block",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {cs.name}
                    </span>
                    {!isValid && (
                      <span style={{ fontSize: 9, color: 'var(--trella-text-subtlest)', fontStyle: 'italic', marginLeft: 'auto' }}>
                        (Không hợp lệ)
                      </span>
                    )}
                  </div>
                );
              })}

              {isWorkflowActive && (
                <>
                  <div style={{ height: 1, backgroundColor: 'var(--trella-border)', margin: '4px 0' }} />
                  <div style={{ padding: '6px 12px 8px', fontSize: 11, color: 'var(--trella-text-subtle)', lineHeight: 1.4, maxWidth: 220 }}>
                    <span style={{ fontWeight: 600, color: 'var(--trella-text)' }}>Gợi ý chuyển trạng thái:</span> Từ &quot;{task.customStatus?.name || 'To Do'}&quot; chỉ có thể chuyển sang: <span style={{ color: '#0052CC', fontWeight: 500 }}>{validListStr || 'không có'}</span>.
                  </div>
                </>
              )}
            </>
          );
        })()}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      {statusPortal}
      <Draggable draggableId={task.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => { if (!snapshot.isDragging) onTaskClick(task); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderBottom: '1px solid var(--trella-border)',
              backgroundColor: snapshot.isDragging ? '#DEEBFF' : hovered ? 'var(--trella-surface-sunken)' : 'var(--trella-surface)',
              cursor: snapshot.isDragging ? 'grabbing' : 'pointer',
              userSelect: 'none',
              ...provided.draggableProps.style,
            }}
          >
            <input type="checkbox" style={{ flexShrink: 0, cursor: 'pointer' }} onClick={e => e.stopPropagation()} readOnly />

            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {getWorkTypeIcon(task)}
            </span>

            {task.issueKey && (
              <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest)', flexShrink: 0, fontWeight: 500, minWidth: 60 }}>
                {task.issueKey}
              </span>
            )}

            <span style={{ flex: 1, fontSize: 13, color: 'var(--trella-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {task.title}
            </span>

            {/* Right-side fixed layout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                ref={statusBadgeRef}
                onClick={openStatusDropdown}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 3,
                  fontSize: 11, fontWeight: 600,
                  backgroundColor: statusColors.bg, color: statusColors.text,
                  whiteSpace: 'nowrap', cursor: 'pointer',
                  width: 100, justifyContent: 'center',
                }}
              >
                {statusLabel}
                <span style={{ fontSize: 9, opacity: 0.8 }}>▾</span>
              </span>

              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: isOverdue ? '#FF5630' : 'var(--trella-text-subtlest)', width: 52, justifyContent: 'flex-end' }}>
                {dueDateLabel ? <><CalendarIcon label="" size="small" />{dueDateLabel}</> : null}
              </span>

              <span style={{ flexShrink: 0, width: 24 }}>
                {assignee ? (
                  <div
                    title={assignee.fullName ?? assignee.email}
                    style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#0052CC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600 }}
                  >
                    {assignee.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={assignee.avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                      : initials(assignee.fullName ?? assignee.email)}
                  </div>
                ) : (
                  <div title="Unassigned" style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: 'var(--trella-surface-sunken)', border: '1px dashed var(--trella-border)' }} />
                )}
              </span>
            </div>
          </div>
        )}
      </Draggable>
    </>
  );
}
