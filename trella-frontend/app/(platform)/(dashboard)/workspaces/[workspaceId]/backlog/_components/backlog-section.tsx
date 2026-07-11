'use client';

import React, { useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import Button from '@atlaskit/button/new';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import type { TaskPublic, ProjectMemberPublic, CustomStatusPublic } from '@/lib/client';
import { SprintsService } from '@/lib/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import { TaskRow } from './task-row';
import { InlineCreateTask } from './inline-create-task';

interface BacklogSectionProps {
  tasks: TaskPublic[];
  projectId: string;
  workspaceId: string;
  members: ProjectMemberPublic[];
  customStatuses: CustomStatusPublic[];
  onTaskClick: (taskId: string) => void;
  onCreateSprint: () => void;
  boardId: string;
  todoColumnId: string;
  transitions?: any[];
}

export function BacklogSection({ tasks, projectId, workspaceId, members, customStatuses, onTaskClick, onCreateSprint, boardId, todoColumnId, transitions = [] }: BacklogSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ border: `1px solid ${'var(--trella-border)'}`, borderRadius: 6, overflow: 'hidden' }}>
      {/* Header row */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: 'var(--trella-surface)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--trella-text-subtlest)', flexShrink: 0 }}>
          {expanded ? <ChevronDownIcon label="" size="small" /> : <ChevronRightIcon label="" size="small" />}
        </span>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--trella-text)' }}>Backlog</span>
        <span style={{ fontSize: 12, color: 'var(--trella-text-subtlest)' }}>({tasks.length} work items)</span>
        <div
          style={{ marginLeft: 'auto', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <Button appearance="primary" spacing="compact" onClick={onCreateSprint}>
            Create sprint
          </Button>
        </div>
      </div>

      {/* Task list */}
      {expanded && (
        <Droppable droppableId="backlog" type="TASK">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                backgroundColor: snapshot.isDraggingOver
                  ? '#CCE0FF'
                  : 'var(--trella-surface)',
                minHeight: 40,
              }}
            >
              {tasks.length === 0 ? (
                <div style={{ margin: '8px 12px', border: '2px dashed #2d3748', borderRadius: 8, padding: '24px 16px', textAlign: 'center' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Your backlog is empty.</span>
                </div>
              ) : (
                tasks.map((task, i) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    index={i}
                    droppableId="backlog"
                    members={members}
                    customStatuses={customStatuses}
                    onTaskClick={t => onTaskClick(t.id)}
                    projectId={projectId}
                    workspaceId={workspaceId}
                    transitions={transitions}
                  />
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
      {expanded && (
        <InlineCreateTask
          boardId={boardId}
          columnId={todoColumnId}
          sprintId={null}
          workspaceId={workspaceId}
          projectId={projectId}
          projectMembers={members}
        />
      )}
    </div>
  );
}
