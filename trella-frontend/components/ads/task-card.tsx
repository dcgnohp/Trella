'use client';
import * as React from 'react';
import { format, isPast, parseISO } from 'date-fns';
import CalendarIcon from '@atlaskit/icon/core/calendar';
import TaskIcon from '@atlaskit/icon/core/task';
import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import SubtasksIcon from '@atlaskit/icon/core/subtasks';
import DragHandleVerticalIcon from '@atlaskit/icon/core/drag-handle-vertical';
import PersonAvatarIcon from '@atlaskit/icon/core/person-avatar';
import { StatusLozenge } from './status-lozenge';
import type { TaskPublic } from '@/lib/client';

export interface TaskCardAssignee {
  id: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

export interface TaskCardProps {
  task: TaskPublic;
  assignee?: TaskCardAssignee | null;
  onClick?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null;
  style?: React.CSSProperties;
  className?: string;
}

const WORK_TYPE_ICON: Record<string, React.ReactNode> = {
  bug: <span style={{ color: '#FF5630' }}><BugIcon label="Bug" size="small" /></span>,
  story: <span style={{ color: '#64BA3B' }}><StoryIcon label="Story" size="small" /></span>,
  subtask: <span style={{ color: '#7A869A' }}><SubtasksIcon label="Subtask" size="small" /></span>,
};

function getWorkTypeIcon(task: TaskPublic) {
  const type = (task as TaskPublic & { workType?: string }).workType?.toLowerCase();
  if (type && WORK_TYPE_ICON[type]) return WORK_TYPE_ICON[type];
  return <span style={{ color: '#0052CC' }}><TaskIcon label="Task" size="small" /></span>;
}

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  ({ task, assignee, onClick, dragHandleProps, style, className }, ref) => {
    const [hovered, setHovered] = React.useState(false);
    const canonical = (task.customStatus?.canonicalStatus ?? 'TODO').toUpperCase();
    const isDone = canonical === 'DONE';

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
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: '6px',
          backgroundColor: hovered && interactive ? '#F8F9FA' : '#FFFFFF',
          border: '1px solid #DFE1E6',
          padding: '10px 12px',
          cursor: interactive ? 'pointer' : 'default',
          transition: 'background 0.1s ease',
          ...style,
        }}
        className={className}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
          {dragHandleProps && (
            <div {...dragHandleProps} style={{ cursor: 'grab', flexShrink: 0, paddingTop: 1, color: '#97A0AF', display: 'flex', alignItems: 'center' }}>
              <DragHandleVerticalIcon label="Drag" size="small" />
            </div>
          )}
          <p style={{
            margin: 0, fontSize: 13, lineHeight: 1.5,
            color: isDone ? '#97A0AF' : '#172B4D',
            textDecoration: isDone ? 'line-through' : 'none',
            flex: 1,
          }}>
            {task.title}
          </p>
        </div>

        {/* Footer row: due date left, type+assignee right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* Due date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {dueDate ? (
              <>
                <span style={{ color: overdue ? '#FF5630' : '#97A0AF', display: 'flex', alignItems: 'center' }}>
                  <CalendarIcon label="" size="small" />
                </span>
                <span style={{ fontSize: 12, color: overdue ? '#FF5630' : '#7A869A' }}>
                  {format(dueDate, 'MMM d, yyyy')}
                </span>
              </>
            ) : null}
          </div>

          {/* Work type icon + assignee avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Work type */}
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {getWorkTypeIcon(task)}
            </span>

            {/* Task key (e.g. SCRUM-1) */}
            {(task as TaskPublic & { issueKey?: string }).issueKey && (
              <span style={{ fontSize: 11, color: '#5E6C84', fontWeight: 500 }}>
                {(task as TaskPublic & { issueKey?: string }).issueKey}
              </span>
            )}

            {/* Assignee avatar */}
            {assignee ? (
              assignee.avatarUrl ? (
                <img
                  src={assignee.avatarUrl}
                  alt={assignee.fullName ?? ''}
                  title={assignee.fullName ?? ''}
                  style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  title={assignee.fullName ?? ''}
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#0052CC,#6554C0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0,
                  }}
                >
                  {initials(assignee.fullName)}
                </div>
              )
            ) : (
              // Unassigned ghost avatar like Jira
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                border: '1px dashed #97A0AF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: '#97A0AF',
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
    <div style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 6, border: '1px solid #DFE1E6' }}>
      <div style={{ height: 13, width: '80%', borderRadius: 4, backgroundColor: '#DFE1E6', marginBottom: 8 }} />
      <div style={{ height: 11, width: '40%', borderRadius: 4, backgroundColor: '#DFE1E6' }} />
    </div>
  );
}
