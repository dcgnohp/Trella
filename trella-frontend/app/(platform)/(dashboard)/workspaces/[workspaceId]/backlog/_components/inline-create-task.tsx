'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ColumnsService, TasksService, type ProjectMemberPublic } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import { Plus, ChevronUp, Calendar as CalendarIcon, User as UserIcon } from 'lucide-react';
import TaskIcon from '@atlaskit/icon/core/task';
import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import FeatureIcon from '@atlaskit/icon/core/highlight';
import RequestIcon from '@atlaskit/icon/core/add';

interface InlineCreateTaskProps {
  /** boardId — required to hit the columns/tasks endpoint that creates a task */
  boardId: string;
  /** column on the underlying board (usually the TODO column) that the task starts in */
  columnId: string;
  /** null → task lands in backlog, otherwise assign to this sprint immediately */
  sprintId: string | null;
  workspaceId: string;
  projectId: string;
  /** members list used to power the assignee picker */
  projectMembers?: ProjectMemberPublic[];
}

const WORK_TYPES = [
  { key: 'STORY', label: 'Story', icon: <StoryIcon label="Story" size="small" />, color: '#64BA3B' },
  { key: 'TASK', label: 'Task', icon: <TaskIcon label="Task" size="small" />, color: '#0052CC' },
  { key: 'FEATURE', label: 'Feature', icon: <FeatureIcon label="Feature" size="small" />, color: '#6554C0' },
  { key: 'REQUEST', label: 'Request', icon: <RequestIcon label="Request" size="small" />, color: '#00B8D9' },
  { key: 'BUG', label: 'Bug', icon: <BugIcon label="Bug" size="small" />, color: '#FF5630' },
];

/**
 * "+ Create" row shown at the bottom of a sprint or the backlog on the backlog page.
 * Behaves like the board's AddTaskForm: type picker, due date, assignee, submit.
 *   - Sprint section: task lands in the target sprint (sprintId prop).
 *   - Backlog section: task lands in the backlog (sprintId = null); we PATCH after
 *     create so SCRUM auto-assignment on the backend doesn't accidentally park the
 *     task in an active sprint.
 */
export function InlineCreateTask({ boardId, columnId, sprintId, workspaceId, projectId, projectMembers = [] }: InlineCreateTaskProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedType, setSelectedType] = useState('TASK');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [dueDate, setDueDate] = useState<string>('');
  const [dateOpen, setDateOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeBtnRef = useRef<HTMLButtonElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const assigneeBtnRef = useRef<HTMLButtonElement>(null);

  // Compute fixed-position coords for each dropdown so they escape parent overflow:hidden.
  // Prefer opening upward; if that would go above the viewport top, open downward.
  const getFixedCoords = (btn: HTMLElement | null, menuHeight: number, menuWidth: number) => {
    if (!btn) return { top: 0, left: 0 };
    const r = btn.getBoundingClientRect();
    const openUp = r.top - menuHeight - 4 >= 8;
    const top = openUp ? r.top - menuHeight - 4 : r.bottom + 4;
    // Right-align dropdowns to the button when there's not enough space to the right.
    let left = r.left;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, r.right - menuWidth);
    }
    return { top, left };
  };

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const currentType = WORK_TYPES.find(t => t.key === selectedType) ?? WORK_TYPES[1];
  const assignee = assigneeId ? projectMembers.find(m => m.userId === assigneeId) : null;
  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const reset = () => {
    setTitle('');
    setSelectedType('TASK');
    setAssigneeId(null);
    setDueDate('');
    setIsEditing(false);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!boardId || !columnId) throw new Error('No board configured yet');
      const task = await ColumnsService.Columns_columnsCreateTask({
        boardId,
        columnId,
        requestBody: {
          title: title.trim(),
          type: selectedType,
          assigneeId: assigneeId ?? undefined,
          dueDate: dueDate || undefined,
        },
      });
      // Force sprintId to the target — backend may have auto-assigned an active
      // sprint for SCRUM workspaces, which is wrong when we're creating in Backlog.
      await TasksService.Tasks_tasksUpdateTask({
        taskId: task.id,
        requestBody: { sprintId },
      });
      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSprints(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectBacklog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(boardId) });
      reset();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to create task');
    },
  });

  const submit = () => {
    if (!title.trim()) return;
    create.mutate();
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '8px 12px', background: 'transparent',
          border: 'none', cursor: 'pointer', color: 'var(--trella-text-subtlest)',
          fontSize: 13, textAlign: 'left',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--trella-text)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--trella-text-subtlest)'; }}
      >
        <Plus size={14} />
        Create
      </button>
    );
  }

  return (
    <div
      style={{
        margin: '4px 8px 8px', padding: '8px 12px',
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'var(--trella-surface)', border: '2px solid #0052CC', borderRadius: 6,
      }}
    >
      {/* Work type dropdown */}
      <button
        ref={typeBtnRef}
        type="button"
        onClick={() => setTypeMenuOpen(v => !v)}
        title={`Work type: ${currentType.label}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, height: 28, padding: '0 8px',
          border: '1px solid var(--trella-border)', borderRadius: 4, background: 'none', cursor: 'pointer',
          color: currentType.color, fontSize: 12, fontWeight: 500, flexShrink: 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', color: currentType.color }}>{currentType.icon}</span>
        <ChevronUp size={12} color="var(--trella-text-subtle)" />
      </button>
      {typeMenuOpen && (() => {
        const { top, left } = getFixedCoords(typeBtnRef.current, 320, 200);
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setTypeMenuOpen(false)} />
            <div
              style={{
                position: 'fixed', top, left, zIndex: 1000,
                background: '#2B2D31', border: '1px solid #3C3F45', borderRadius: 6,
                padding: '4px 0', minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {WORK_TYPES.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setSelectedType(t.key); setTypeMenuOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', color: t.color, fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon}</span>
                  <span style={{ color: '#E0E2E7' }}>{t.label}</span>
                </button>
              ))}
              <div style={{ borderTop: '1px solid #3C3F45', margin: '4px 0' }} />
              {[{ label: 'Add work type' }, { label: 'Edit work type' }, { label: 'Manage' }].map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => { setTypeMenuOpen(false); toast.info(`${item.label} — coming soon`); }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 14px', background: 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left', color: '#9FADBC', fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        );
      })()}

      {/* Title input with rich placeholder */}
      <input
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { reset(); }
        }}
        placeholder="Describe what needs to be done..."
        disabled={create.isPending}
        style={{
          flex: 1, height: 28, padding: '0 4px', border: 'none', outline: 'none',
          background: 'transparent', color: 'var(--trella-text)', fontSize: 13,
        }}
      />

      {/* Due date */}
      <button
        ref={dateBtnRef}
        type="button"
        onClick={() => setDateOpen(v => !v)}
        title={dueDate ? `Due: ${new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Set due date'}
        style={{
          display: 'flex', alignItems: 'center', height: 28,
          width: dueDate ? 'auto' : 28, padding: dueDate ? '0 8px' : 0,
          border: '1px solid var(--trella-border)', borderRadius: 4, background: 'none',
          cursor: 'pointer', justifyContent: 'center',
          color: dueDate ? '#0052CC' : 'var(--trella-text-subtle)', fontSize: 12, gap: 4, flexShrink: 0,
        }}
      >
        <CalendarIcon size={14} />
        {dueDate && new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </button>
      {dateOpen && (() => {
        const { top, left } = getFixedCoords(dateBtnRef.current, 90, 220);
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setDateOpen(false)} />
            <div
              style={{
                position: 'fixed', top, left, zIndex: 1000,
                background: 'var(--trella-surface)', border: '1px solid var(--trella-border)', borderRadius: 6,
                padding: 8, boxShadow: '0 4px 16px rgba(9,30,66,0.18)',
              }}
            >
              <input
                type="date"
                value={dueDate}
                onChange={e => { setDueDate(e.target.value); setDateOpen(false); }}
                style={{ fontSize: 13, border: '1px solid var(--trella-border)', borderRadius: 4, padding: '4px 8px', outline: 'none' }}
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => { setDueDate(''); setDateOpen(false); }}
                  style={{
                    display: 'block', marginTop: 4, width: '100%', fontSize: 12,
                    color: '#FF5630', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  Clear date
                </button>
              )}
            </div>
          </>
        );
      })()}

      {/* Assignee */}
      <button
        ref={assigneeBtnRef}
        type="button"
        onClick={() => setAssigneeOpen(v => !v)}
        title={assignee ? (assignee.fullName ?? assignee.email) : 'Assign'}
        style={{
          display: 'flex', alignItems: 'center', height: 28,
          width: assignee ? 'auto' : 28, padding: assignee ? '0 8px' : 0,
          border: '1px solid var(--trella-border)', borderRadius: 4, background: 'none',
          cursor: 'pointer', justifyContent: 'center',
          color: assignee ? 'var(--trella-text)' : 'var(--trella-text-subtle)', fontSize: 12, gap: 4, flexShrink: 0,
        }}
      >
        {assignee ? (
          <div
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'linear-gradient(135deg,#0052CC,#6554C0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: 'white',
            }}
          >
            {initials(assignee.fullName ?? assignee.email)}
          </div>
        ) : (
          <UserIcon size={14} />
        )}
        {assignee && (
          <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {assignee.fullName ?? assignee.email}
          </span>
        )}
      </button>
      {assigneeOpen && (() => {
        const menuH = Math.min(Math.max(projectMembers.length * 34 + 20, 60), 320);
        const { top, left } = getFixedCoords(assigneeBtnRef.current, menuH, 220);
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setAssigneeOpen(false)} />
            <div
              style={{
                position: 'fixed', top, left, zIndex: 1000,
                background: 'var(--trella-surface)', border: '1px solid var(--trella-border)', borderRadius: 6,
                minWidth: 220, maxHeight: 320, overflow: 'auto',
                boxShadow: '0 4px 16px rgba(9,30,66,0.18)',
              }}
            >
              {projectMembers.length === 0 && (
                <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--trella-text-subtlest)' }}>No members</div>
              )}
              {projectMembers.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setAssigneeId(m.userId); setAssigneeOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 12px', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 13, color: 'var(--trella-text)',
                    textAlign: 'left', fontWeight: assigneeId === m.userId ? 600 : 400,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-sunken)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'linear-gradient(135deg,#0052CC,#6554C0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0,
                    }}
                  >
                    {initials(m.fullName ?? m.email)}
                  </div>
                  {m.fullName ?? m.email}
                </button>
              ))}
              {assigneeId && (
                <>
                  <div style={{ height: 1, backgroundColor: 'var(--trella-border)' }} />
                  <button
                    type="button"
                    onClick={() => { setAssigneeId(null); setAssigneeOpen(false); }}
                    style={{
                      display: 'flex', width: '100%', padding: '7px 12px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 13, color: '#FF5630', textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-sunken)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    Remove assignee
                  </button>
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* Create button */}
      <button
        type="button"
        onClick={submit}
        disabled={!title.trim() || create.isPending}
        style={{
          height: 28, padding: '0 14px', border: 'none', borderRadius: 4,
          background: title.trim() && !create.isPending ? '#0052CC' : 'var(--trella-surface-sunken)',
          color: title.trim() && !create.isPending ? 'white' : 'var(--trella-text-subtlest)',
          fontSize: 12, fontWeight: 500,
          cursor: title.trim() && !create.isPending ? 'pointer' : 'not-allowed',
        }}
      >
        {create.isPending ? 'Creating...' : 'Create'}
      </button>

      {/* Cancel */}
      <button
        type="button"
        onClick={reset}
        title="Cancel (Esc)"
        style={{
          height: 28, width: 28, border: '1px solid var(--trella-border)', borderRadius: 4,
          background: 'transparent', color: 'var(--trella-text-subtle)', fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  );
}
