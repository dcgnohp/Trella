'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { format, isPast, parseISO } from 'date-fns';
import CalendarIcon from '@atlaskit/icon/core/calendar';
import TaskIcon from '@atlaskit/icon/core/task';
import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import SubtasksIcon from '@atlaskit/icon/core/subtasks';
import DragHandleVerticalIcon from '@atlaskit/icon/core/drag-handle-vertical';
import PersonAvatarIcon from '@atlaskit/icon/core/person-avatar';
import type { TaskPublic } from '@/lib/client';

export interface TaskCardAssignee {
  id: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

export interface TaskCardProps {
  task: TaskPublic;
  assignee?: TaskCardAssignee | null;
  subtasks?: TaskPublic[];
  onClick?: () => void;
  onSubtaskClick?: (sub: TaskPublic) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null;
  style?: React.CSSProperties;
  className?: string;
}

const WORK_TYPE_ICON: Record<string, React.ReactNode> = {
  task: <span style={{ color: '#0052CC' }}><TaskIcon label="Task" size="small" /></span>,
  bug: <span style={{ color: '#FF5630' }}><BugIcon label="Bug" size="small" /></span>,
  story: <span style={{ color: '#64BA3B' }}><StoryIcon label="Story" size="small" /></span>,
  subtask: <span style={{ color: 'var(--trella-text-subtlest)' }}><SubtasksIcon label="Subtask" size="small" /></span>,
  feature: <span style={{ color: '#6554C0' }}><TaskIcon label="Feature" size="small" /></span>,
  request: <span style={{ color: '#FFAB00' }}><TaskIcon label="Request" size="small" /></span>,
};

function getWorkTypeIcon(task: TaskPublic) {
  const type = (task.type ?? 'task').toLowerCase();
  return WORK_TYPE_ICON[type] ?? WORK_TYPE_ICON['task'];
}

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

const STATUS_DOT: Record<string, string> = {
  DONE: '#36B37E',
  IN_PROGRESS: '#0052CC',
  TODO: 'var(--trella-text-subtlest)',
  PENDING: '#FFAB00',
};

export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  ({ task, assignee, subtasks = [], onClick, onSubtaskClick, dragHandleProps, style, className }, ref) => {
    const [hovered, setHovered] = React.useState(false);
    const [subtaskPopover, setSubtaskPopover] = React.useState(false);
    const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number } | null>(null);
    const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const badgeRef = React.useRef<HTMLSpanElement>(null);
    const canonical = (task.customStatus?.canonicalStatus ?? 'TODO').toUpperCase();
    const isDone = canonical === 'DONE';
    const isSubtask = !!(task.parentId) || (task.type ?? '').toUpperCase() === 'SUBTASK';
    const subtaskCount = subtasks.length;

    const openPopover = () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (badgeRef.current) {
        const r = badgeRef.current.getBoundingClientRect();
        setPopoverPos({ top: r.bottom + 4, left: r.right });
      }
      setSubtaskPopover(true);
    };
    const scheduleClose = () => {
      closeTimer.current = setTimeout(() => setSubtaskPopover(false), 120);
    };
    const cancelClose = () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };

    const dueDate = task.dueDate ? parseISO(task.dueDate) : null;
    const overdue = dueDate ? isPast(dueDate) && !isDone : false;
    const interactive = typeof onClick === 'function';

    return (
      <div
        ref={ref}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={interactive ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
        } : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); scheduleClose(); }}
        style={{
          position: 'relative',
          borderRadius: '6px',
          backgroundColor: hovered && interactive
            ? 'var(--trella-surface-hover)'
            : (isSubtask ? 'var(--trella-surface-raised)' : 'var(--trella-surface)'),
          border: '1px solid var(--trella-border)',
          borderLeft: isSubtask ? '3px solid var(--trella-text-subtlest)' : '1px solid var(--trella-border)',
          padding: isSubtask ? '7px 12px 7px 10px' : '10px 12px',
          cursor: interactive ? 'pointer' : 'default',
          transition: 'background 0.1s ease',
          marginLeft: isSubtask ? 8 : 0,
          ...style,
        }}
        className={className}
      >
        {/* Subtask label */}
        {isSubtask && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <span style={{ color: 'var(--trella-text-subtlest)', display: 'flex', alignItems: 'center' }}>
              <SubtasksIcon label="" size="small" />
            </span>
            <span style={{ fontSize: 10, color: 'var(--trella-text-subtlest)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Subtask
            </span>
          </div>
        )}

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: isSubtask ? 4 : 8 }}>
          {dragHandleProps && (
            <div {...dragHandleProps} style={{ cursor: 'grab', flexShrink: 0, paddingTop: 1, color: 'var(--trella-text-subtlest)', display: 'flex', alignItems: 'center' }}>
              <DragHandleVerticalIcon label="Drag" size="small" />
            </div>
          )}
          <p style={{
            margin: 0,
            fontSize: isSubtask ? 12 : 13,
            lineHeight: 1.5,
            color: isDone ? 'var(--trella-text-subtlest)' : (isSubtask ? '#344563' : 'var(--trella-text)'),
            textDecoration: isDone ? 'line-through' : 'none',
            flex: 1,
          }}>
            {task.title}
          </p>
        </div>

        {/* Footer row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* Due date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {dueDate ? (
              <>
                <span style={{ color: overdue ? '#FF5630' : 'var(--trella-text-subtlest)', display: 'flex', alignItems: 'center' }}>
                  <CalendarIcon label="" size="small" />
                </span>
                <span style={{ fontSize: 12, color: overdue ? '#FF5630' : 'var(--trella-text-subtlest)' }}>
                  {format(dueDate, 'MMM d, yyyy')}
                </span>
              </>
            ) : null}
          </div>

          {/* Right side: subtask badge + work type + assignee */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Subtask count badge — hover shows popover below via portal */}
            {subtaskCount > 0 && (
              <>
                <span
                  ref={badgeRef}
                  onMouseEnter={(e) => { e.stopPropagation(); openPopover(); }}
                  onMouseLeave={scheduleClose}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'relative',
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                    fontSize: 11, color: 'var(--trella-text-subtle)',
                    backgroundColor: 'var(--trella-border)', padding: '1px 5px', borderRadius: 3,
                    cursor: 'default',
                  }}
                >
                  <SubtasksIcon label="" size="small" />
                  {subtaskCount}
                </span>
                {subtaskPopover && popoverPos && typeof document !== 'undefined' && ReactDOM.createPortal(
                  <div
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed',
                      top: popoverPos.top,
                      left: popoverPos.left,
                      transform: 'translateX(-100%)',
                      zIndex: 9999,
                      backgroundColor: 'var(--trella-surface)',
                      border: '1px solid var(--trella-border)',
                      borderRadius: 6,
                      boxShadow: '0 4px 20px rgba(9,30,66,0.18)',
                      width: 260,
                      maxHeight: 220,
                      overflowY: 'auto',
                      padding: '6px 0',
                    }}
                  >
                    <p style={{ margin: 0, padding: '4px 12px 6px', fontSize: 11, fontWeight: 700, color: 'var(--trella-text-subtlest)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Subtasks ({subtaskCount})
                    </p>
                    {subtasks.map((sub) => {
                      const sc = (sub.customStatus?.canonicalStatus ?? 'TODO').toUpperCase();
                      const dotColor = STATUS_DOT[sc] ?? 'var(--trella-text-subtlest)';
                      const subDone = sc === 'DONE';
                      return (
                        <button
                          key={sub.id}
                          onClick={() => { onSubtaskClick?.(sub); setSubtaskPopover(false); }}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                            width: '100%', padding: '6px 12px',
                            background: 'none', border: 'none',
                            cursor: onSubtaskClick ? 'pointer' : 'default',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--trella-surface-sunken)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, marginTop: 4 }} />
                          <span style={{ fontSize: 12, color: subDone ? 'var(--trella-text-subtlest)' : 'var(--trella-text)', textDecoration: subDone ? 'line-through' : 'none', lineHeight: 1.5, flex: 1 }}>
                            {sub.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>,
                  document.body
                )}
              </>
            )}

            {!isSubtask && (
              <span style={{ display: 'flex', alignItems: 'center' }}>
                {getWorkTypeIcon(task)}
              </span>
            )}

            {(task as TaskPublic & { issueKey?: string }).issueKey && (
              <span style={{ fontSize: 11, color: 'var(--trella-text-subtle)', fontWeight: 500 }}>
                {(task as TaskPublic & { issueKey?: string }).issueKey}
              </span>
            )}

            {assignee ? (
              assignee.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assignee.avatarUrl}
                  alt={assignee.fullName ?? ''}
                  title={assignee.fullName ?? ''}
                  style={{ width: isSubtask ? 20 : 24, height: isSubtask ? 20 : 24, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  title={assignee.fullName ?? ''}
                  style={{
                    width: isSubtask ? 20 : 24, height: isSubtask ? 20 : 24,
                    borderRadius: '50%', background: 'linear-gradient(135deg,#0052CC,#6554C0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isSubtask ? 8 : 10, fontWeight: 700, color: 'white', flexShrink: 0,
                  }}
                >
                  {initials(assignee.fullName)}
                </div>
              )
            ) : (
              <div style={{
                width: isSubtask ? 20 : 24, height: isSubtask ? 20 : 24,
                borderRadius: '50%', border: '1px dashed #97A0AF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: 'var(--trella-text-subtlest)',
              }}>
                <PersonAvatarIcon label="" size="small" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

TaskCard.displayName = 'TaskCard';

export function TaskCardSkeleton() {
  return (
    <div style={{ padding: 12, backgroundColor: 'var(--trella-surface)', borderRadius: 6, border: '1px solid var(--trella-border)' }}>
      <div style={{ height: 13, width: '80%', borderRadius: 4, backgroundColor: 'var(--trella-border)', marginBottom: 8 }} />
      <div style={{ height: 11, width: '40%', borderRadius: 4, backgroundColor: 'var(--trella-border)' }} />
    </div>
  );
}
