"use client";

import * as React from "react";
import { Stack, Text } from "@atlaskit/primitives";
import InlineEdit from "@atlaskit/inline-edit";
import Textfield from "@atlaskit/textfield";
import CalendarIcon from '@atlaskit/icon/core/calendar';
import CrossIcon from '@atlaskit/icon/core/cross';
import TaskIcon from '@atlaskit/icon/core/task';
import AddIcon from '@atlaskit/icon/core/add';
import ShowMoreHorizontalIcon from '@atlaskit/icon/core/show-more-horizontal';
import PersonAvatarIcon from '@atlaskit/icon/core/person-avatar';

import type { TaskPublic } from "@/lib/client";
import { useTaskRealtime } from "@/lib/realtime/use-realtime";
import { StatusLozenge } from "@/components/ads/status-lozenge";
import type { CanonicalStatus } from "@/lib/status/display-style";

import { CommentsTab } from "../modals/task-detail-modal/comments-tab";
import { AttachmentsTab } from "../modals/task-detail-modal/attachments-tab";
import { ActivityTab } from "../modals/task-detail-modal/activity-tab";

export interface TaskDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  task: TaskPublic | null;
  actorNames?: Record<string, string>;
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "#FF5630",
  HIGH: "#FF991F",
  MEDIUM: "#0052CC",
  LOW: "#97A0AF",
};

const TABS = ['Comments', 'Attachments', 'Activity'] as const;

export function TaskDetailDrawer({ open, onClose, task, actorNames }: TaskDetailDrawerProps) {
  const [activeTab, setActiveTab] = React.useState(0);

  useTaskRealtime({
    taskId: open ? task?.id ?? null : null,
    projectId: open ? task?.projectId ?? null : null,
  });

  React.useEffect(() => {
    if (open) setActiveTab(0);
  }, [open, task?.id]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const canonicalStatus = (task?.customStatus?.canonicalStatus ?? "TODO") as CanonicalStatus;
  const priorityColor = PRIORITY_COLORS[task?.priority ?? ""] ?? "#97A0AF";

  return (
    <>
      {/* Blanket */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            backgroundColor: 'rgba(9,30,66,0.54)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: 48, paddingBottom: 48,
            overflowY: 'auto',
          }}
        >
          {/* Modal — stop click propagation so clicking inside doesn't close */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '90vw', maxWidth: 1000, minWidth: 640,
              backgroundColor: '#FFFFFF',
              borderRadius: 8,
              boxShadow: '0 8px 64px rgba(9,30,66,0.25)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'calc(100vh - 96px)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              height: 48, display: 'flex', alignItems: 'center',
              padding: '0 16px', borderBottom: '1px solid #DFE1E6',
              flexShrink: 0, gap: 8,
            }}>
              {/* Breadcrumb: Add epic / TASK-ID */}
              <span style={{ fontSize: 12, color: '#97A0AF', cursor: 'pointer' }}>Add epic</span>
              <span style={{ color: '#DFE1E6' }}>/</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#0052CC', display: 'flex' }}><TaskIcon label="" size="small" /></span>
                <span style={{ fontSize: 12, color: '#5E6C84', fontWeight: 500 }}>
                  {(task as TaskPublic & { issueKey?: string })?.issueKey ?? task?.id?.slice(0, 8)}
                </span>
              </span>
              <div style={{ flex: 1 }} />
              {/* Status badge */}
              <StatusLozenge status={canonicalStatus} label={task?.customStatus?.name ?? canonicalStatus} />
              {task?.priority && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: priorityColor,
                  padding: '2px 8px', borderRadius: 3,
                  backgroundColor: `${priorityColor}1A`,
                }}>
                  {task.priority}
                </span>
              )}
              <button
                onClick={onClose}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#5E6C84', display: 'flex', alignItems: 'center',
                  padding: 4, borderRadius: 4,
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(9,30,66,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <CrossIcon label="Close" size="small" />
              </button>
            </div>

            {/* Body: left content + right details */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Left */}
              <div style={{
                flex: '1 1 60%', overflowY: 'auto',
                padding: '24px 28px', borderRight: '1px solid #DFE1E6',
              }}>
                {!task ? (
                  <Text color="color.text.subtlest">Loading…</Text>
                ) : (
                  <Stack space="space.300">
                    {/* Title */}
                    <InlineEdit
                      defaultValue={task.title}
                      editView={({ errorMessage: _e, ...fieldProps }) => (
                        <Textfield {...fieldProps} autoFocus />
                      )}
                      readView={() => (
                        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#172B4D', margin: 0, lineHeight: 1.4 }}>
                          {task.title}
                        </h2>
                      )}
                      onConfirm={() => {/* TODO: PATCH */}}
                    />

                    {/* Quick action row: + ... */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button style={{ width: 28, height: 28, border: '1px solid #DFE1E6', borderRadius: 4, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5E6C84' }}>
                        <AddIcon label="Add" size="small" />
                      </button>
                      <button style={{ width: 28, height: 28, border: '1px solid #DFE1E6', borderRadius: 4, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5E6C84' }}>
                        <ShowMoreHorizontalIcon label="More" size="small" />
                      </button>
                    </div>

                    {/* Description */}
                    <Stack space="space.100">
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#172B4D' }}>Description</p>
                      <div style={{
                        padding: '8px 12px', borderRadius: 4,
                        border: '1px solid transparent',
                        minHeight: 60, cursor: 'text', fontSize: 14,
                        color: task.description ? '#172B4D' : '#97A0AF',
                        lineHeight: 1.6,
                      }}
                        onMouseEnter={e => (e.currentTarget.style.border = '1px solid #DFE1E6')}
                        onMouseLeave={e => (e.currentTarget.style.border = '1px solid transparent')}
                      >
                        {task.description ?? 'Add a description…'}
                      </div>
                    </Stack>

                    {/* Subtasks */}
                    <div>
                      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#172B4D' }}>Subtasks</p>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#5E6C84', padding: 0 }}>
                        + Add subtask
                      </button>
                    </div>

                    {/* Linked work items */}
                    <div>
                      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#172B4D' }}>Linked work items</p>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#5E6C84', padding: 0 }}>
                        + Add linked work item
                      </button>
                    </div>

                    {/* Activity tabs */}
                    <div>
                      <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#172B4D' }}>Activity</p>
                      <div style={{ display: 'flex', borderBottom: '1px solid #DFE1E6', marginBottom: 16, gap: 4 }}>
                        {TABS.map((tab, i) => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(i)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '6px 12px', fontSize: 13,
                              color: activeTab === i ? '#0052CC' : '#5E6C84',
                              fontWeight: activeTab === i ? 600 : 400,
                              borderBottom: activeTab === i ? '2px solid #0052CC' : '2px solid transparent',
                              marginBottom: -1,
                            }}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                      {activeTab === 0 && <CommentsTab taskId={task.id} projectId={task.projectId} />}
                      {activeTab === 1 && <AttachmentsTab taskId={task.id} />}
                      {activeTab === 2 && <ActivityTab taskId={task.id} active={activeTab === 2} actorNames={actorNames} />}
                    </div>
                  </Stack>
                )}
              </div>

              {/* Right: details sidebar */}
              <div style={{ flex: '0 0 280px', overflowY: 'auto', padding: 20, backgroundColor: '#F4F5F7' }}>
                {task && <DetailsSidebar task={task} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailsSidebar({ task }: { task: TaskPublic }) {
  return (
    <Stack space="space.250">
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#7A869A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</p>

      <DetailRow label="Assignee">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#DFE1E6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A869A' }}>
            <PersonAvatarIcon label="" size="small" />
          </div>
          <span style={{ fontSize: 13, color: '#172B4D' }}>Unassigned</span>
        </div>
        {!task.assigneeId && (
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: '#0052CC', marginTop: 2 }}>
            Assign to me
          </button>
        )}
      </DetailRow>

      <DetailRow label="Priority">
        <span style={{ fontSize: 13, color: '#172B4D' }}>{task.priority ?? 'None'}</span>
      </DetailRow>

      <DetailRow label="Parent">
        <span style={{ fontSize: 13, color: '#97A0AF' }}>None</span>
      </DetailRow>

      <DetailRow label="Due date">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {task.dueDate ? (
            <>
              <span style={{ color: '#172B4D', display: 'flex' }}><CalendarIcon label="" size="small" /></span>
              <span style={{ fontSize: 13, color: '#172B4D' }}>
                {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: '#97A0AF' }}>None</span>
          )}
        </div>
      </DetailRow>

      <DetailRow label="Labels">
        <span style={{ fontSize: 13, color: '#97A0AF' }}>None</span>
      </DetailRow>

      <DetailRow label="Team">
        <span style={{ fontSize: 13, color: '#97A0AF' }}>None</span>
      </DetailRow>

      <DetailRow label="Start date">
        <span style={{ fontSize: 13, color: '#97A0AF' }}>None</span>
      </DetailRow>

      <DetailRow label="Sprint">
        <span style={{ fontSize: 13, color: '#0052CC', cursor: 'pointer' }}>Sprint 0</span>
      </DetailRow>

      <DetailRow label="Story points">
        <span style={{ fontSize: 13, color: '#97A0AF' }}>None</span>
      </DetailRow>

      <DetailRow label="Reporter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#0052CC,#6554C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white' }}>KS</div>
          <span style={{ fontSize: 13, color: '#172B4D' }}>You</span>
        </div>
      </DetailRow>

      <div style={{ borderTop: '1px solid #DFE1E6', paddingTop: 12, marginTop: 4 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#97A0AF' }}>
          Created {new Date(task.createdAt).toLocaleDateString()}
        </p>
      </div>
    </Stack>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, paddingBottom: 8 }}>
      <span style={{ fontSize: 13, color: '#5E6C84', paddingTop: 2 }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}
