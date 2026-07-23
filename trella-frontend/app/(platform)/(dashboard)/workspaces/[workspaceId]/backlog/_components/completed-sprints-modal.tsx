'use client';

import React, { useState } from 'react';
import type { SprintWithTasks, ProjectMemberPublic, CustomStatusPublic } from '@/lib/client';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import CrossIcon from '@atlaskit/icon/core/cross';
import Button from '@atlaskit/button/new';

interface CompletedSprintsModalProps {
  completedSprints: SprintWithTasks[];
  onClose: () => void;
  onTaskClick: (taskId: string) => void;
  members: ProjectMemberPublic[];
  customStatuses: CustomStatusPublic[];
}

export function CompletedSprintsModal({
  completedSprints,
  onClose,
  onTaskClick,
  members,
  customStatuses,
}: CompletedSprintsModalProps) {
  const [expandedSprintIds, setExpandedSprintIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedSprintIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getMember = (assigneeId?: string | null) => {
    if (!assigneeId) return null;
    return members.find(m => m.userId === assigneeId);
  };

  const getStatus = (statusId?: string | null) => {
    if (!statusId) return null;
    return customStatuses.find(s => s.id === statusId);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(9, 30, 66, 0.54)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 800,
          maxHeight: '85vh',
          backgroundColor: 'var(--trella-surface, #ffffff)',
          borderRadius: 8,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--trella-border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--trella-surface-subtle, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🏆</span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--trella-text, #1e293b)' }}>
                Completed Sprints History
              </h2>
              <p style={{ fontSize: 12, color: 'var(--trella-text-subtle, #64748b)', margin: '2px 0 0' }}>
                Review past sprints, work items accomplished, and completion rates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--trella-text-subtle, #64748b)',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CrossIcon label="Close" size="medium" />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {completedSprints.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--trella-text-subtlest, #94a3b8)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <p style={{ fontSize: 14, margin: 0 }}>No completed sprints found.</p>
              <p style={{ fontSize: 12, margin: '4px 0 0' }}>
                When you complete active sprints, they will appear here in history.
              </p>
            </div>
          ) : (
            completedSprints.map(sprint => {
              const isExpanded = !!expandedSprintIds[sprint.id];
              const tasks = sprint.tasks ?? [];
              const totalTasks = tasks.length;
              const doneTasks = tasks.filter(t => (t.customStatus?.canonicalStatus ?? 'TODO') === 'DONE').length;
              const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

              const totalStoryPoints = tasks.reduce((sum, t) => sum + (t.storyPoint || 0), 0);
              const doneStoryPoints = tasks
                .filter(t => (t.customStatus?.canonicalStatus ?? 'TODO') === 'DONE')
                .reduce((sum, t) => sum + (t.storyPoint || 0), 0);

              const dateRange =
                sprint.startDate && sprint.endDate
                  ? `${new Date(sprint.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${new Date(sprint.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
                  : 'No dates recorded';

              return (
                <div
                  key={sprint.id}
                  style={{
                    border: '1px solid var(--trella-border, #e2e8f0)',
                    borderRadius: 8,
                    backgroundColor: 'var(--trella-surface, #ffffff)',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s ease',
                  }}
                >
                  {/* Sprint Header */}
                  <div
                    style={{
                      padding: '14px 18px',
                      backgroundColor: 'var(--trella-surface-subtle, #f8fafc)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    onClick={() => toggleExpand(sprint.id)}
                  >
                    <span style={{ color: 'var(--trella-text-subtle, #64748b)', display: 'flex' }}>
                      {isExpanded ? <ChevronDownIcon label="" size="small" /> : <ChevronRightIcon label="" size="small" />}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--trella-text, #1e293b)' }}>
                          {sprint.name}
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            backgroundColor: completionPct === 100 ? '#e6f4ea' : '#e8f0fe',
                            color: completionPct === 100 ? '#137333' : '#1a73e8',
                            border: `1px solid ${completionPct === 100 ? '#ceead6' : '#d2e3fc'}`,
                          }}
                        >
                          {completionPct}% Done ({doneTasks}/{totalTasks} items)
                        </span>
                      </div>
                      {sprint.goal && (
                        <p style={{ fontSize: 12, color: 'var(--trella-text-subtle, #475569)', margin: '4px 0 0', fontStyle: 'italic' }}>
                          Goal: {sprint.goal}
                        </p>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest, #94a3b8)', marginTop: 2, display: 'block' }}>
                        {dateRange}
                      </span>
                    </div>

                    {/* Progress Bar & Story Points */}
                    <div style={{ width: 140, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--trella-text-subtle, #64748b)' }}>
                        {doneStoryPoints} / {totalStoryPoints} pts
                      </span>
                      <div
                        style={{
                          width: '100%',
                          height: 6,
                          backgroundColor: 'var(--trella-border, #e2e8f0)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${completionPct}%`,
                            height: '100%',
                            backgroundColor: completionPct === 100 ? '#36B37E' : '#0052CC',
                            borderRadius: 3,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Task List */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--trella-border, #e2e8f0)', padding: 12, backgroundColor: 'var(--trella-surface, #ffffff)' }}>
                      {tasks.length === 0 ? (
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--trella-text-subtlest, #94a3b8)', padding: '8px 12px' }}>
                          No work items recorded in this sprint.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {tasks.map(task => {
                            const assignee = getMember(task.assigneeId);
                            const status = getStatus(task.customStatusId) || task.customStatus;
                            const isDone = status?.canonicalStatus === 'DONE';

                            return (
                              <div
                                key={task.id}
                                onClick={() => onTaskClick(task.id)}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 6,
                                  border: '1px solid var(--trella-border-subtle, #f1f5f9)',
                                  backgroundColor: 'var(--trella-surface, #ffffff)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  cursor: 'pointer',
                                  transition: 'background-color 0.15s ease',
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover, #f8fafc)';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.backgroundColor = 'var(--trella-surface, #ffffff)';
                                }}
                              >
                                {task.issueKey && (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--trella-text-subtle, #64748b)', minWidth: 60 }}>
                                    {task.issueKey}
                                  </span>
                                )}

                                <span
                                  style={{
                                    fontSize: 13,
                                    color: 'var(--trella-text, #1e293b)',
                                    flex: 1,
                                    textDecoration: isDone ? 'line-through' : 'none',
                                    opacity: isDone ? 0.75 : 1,
                                  }}
                                >
                                  {task.title}
                                </span>

                                {task.storyPoint !== undefined && task.storyPoint !== null && (
                                  <span
                                    style={{
                                      padding: '1px 6px',
                                      borderRadius: 10,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      backgroundColor: 'var(--trella-surface-subtle, #e2e8f0)',
                                      color: 'var(--trella-text, #475569)',
                                    }}
                                  >
                                    {task.storyPoint} pts
                                  </span>
                                )}

                                {status && (
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      backgroundColor: status.color ? `${status.color}20` : '#e2e8f0',
                                      color: status.color || '#475569',
                                    }}
                                  >
                                    {status.name}
                                  </span>
                                )}

                                {assignee && (
                                  <div
                                    title={assignee.fullName || assignee.email}
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: '50%',
                                      backgroundColor: '#0052CC',
                                      color: '#fff',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 600,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {(assignee.fullName || assignee.email).slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--trella-border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'var(--trella-surface-subtle, #f8fafc)',
          }}
        >
          <Button appearance="default" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
