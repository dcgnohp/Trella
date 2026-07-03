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

interface BacklogSectionProps {
  tasks: TaskPublic[];
  projectId: string;
  workspaceId: string;
  members: ProjectMemberPublic[];
  customStatuses: CustomStatusPublic[];
  onTaskClick: (taskId: string) => void;
  onCreateSprint: () => void;
}

export function BacklogSection({ tasks, projectId, workspaceId, members, customStatuses, onTaskClick, onCreateSprint }: BacklogSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ border: `1px solid ${'#DFE1E6'}`, borderRadius: 6, overflow: 'hidden' }}>
      {/* Header row */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ display: 'flex', alignItems: 'center', color: '#97A0AF', flexShrink: 0 }}>
          {expanded ? <ChevronDownIcon label="" size="small" /> : <ChevronRightIcon label="" size="small" />}
        </span>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#172B4D' }}>Backlog</span>
        <span style={{ fontSize: 12, color: '#97A0AF' }}>({tasks.length} work items)</span>
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
                  : '#FFFFFF',
                minHeight: 40,
              }}
            >
              {tasks.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <span style={{ fontSize: 12, color: '#97A0AF' }}>No items in backlog</span>
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
                  />
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </div>
  );
}
