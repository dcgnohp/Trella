'use client';

import React, { useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import Button from '@atlaskit/button/new';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import DeleteIcon from '@atlaskit/icon/core/delete';
import ArrowRightIcon from '@atlaskit/icon/core/arrow-right';
import type { TaskPublic, ProjectMemberPublic, CustomStatusPublic } from '@/lib/client';
import { SprintsService } from '@/lib/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import { TaskRow, TaskRowContent, StackedDragPreview } from './task-row';
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
  selectedTaskIds?: string[];
  onToggleSelectTask?: (taskId: string, shiftKey: boolean) => void;
  onToggleSectionTasks?: (taskIds: string[], selectAll: boolean) => void;
  onMoveSelectedToActive?: () => void;
  onDeleteSelected?: () => void;
  activeSprintName?: string | null;
  isDraggingMulti?: boolean;
}

export function BacklogSection({
  tasks,
  projectId,
  workspaceId,
  members,
  customStatuses,
  onTaskClick,
  onCreateSprint,
  boardId,
  todoColumnId,
  transitions = [],
  selectedTaskIds = [],
  onToggleSelectTask,
  onToggleSectionTasks,
  onMoveSelectedToActive,
  onDeleteSelected,
  activeSprintName,
  isDraggingMulti = false,
}: BacklogSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const selectedInBacklogCount = tasks.filter(t => selectedTaskIds.includes(t.id)).length;

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

        {/* Section Select All Checkbox */}
        {tasks.length > 0 && (
          <input
            type="checkbox"
            checked={tasks.length > 0 && tasks.every(t => selectedTaskIds.includes(t.id))}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSectionTasks?.(tasks.map(t => t.id), e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            title="Select all tasks in Backlog"
            style={{ cursor: 'pointer', width: 15, height: 15, flexShrink: 0 }}
          />
        )}

        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--trella-text)' }}>Backlog</span>
        <span style={{ fontSize: 12, color: 'var(--trella-text-subtlest)' }}>({tasks.length} work items)</span>

        {/* Action buttons (Create sprint & Bulk Action Buttons when selected) */}
        <div
          style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          {selectedInBacklogCount > 0 && (
            <>
              {onMoveSelectedToActive && (
                <button
                  onClick={onMoveSelectedToActive}
                  title={activeSprintName ? `Chuyển ${selectedInBacklogCount} công việc sang ${activeSprintName}` : `Chuyển ${selectedInBacklogCount} công việc sang Active Sprint`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: '#0052CC',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    padding: '5px 12px',
                    height: 30,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0, 82, 204, 0.25)',
                    transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = '#0065FF';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(0, 82, 204, 0.35)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = '#0052CC';
                    e.currentTarget.style.boxShadow = '0 2px 5px rgba(0, 82, 204, 0.25)';
                  }}
                >
                  <ArrowRightIcon label="Move" size="small" />
                  <span>Move to active sprint</span>
                  <span
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.25)',
                      color: '#FFFFFF',
                      padding: '1px 7px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 700,
                      marginLeft: 2,
                    }}
                  >
                    {selectedInBacklogCount}
                  </span>
                </button>
              )}
              {onDeleteSelected && (
                <button
                  onClick={onDeleteSelected}
                  title={`Xóa ${selectedInBacklogCount} công việc đã chọn`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FFEBE6',
                    color: '#DE350B',
                    border: '1px solid rgba(222, 53, 11, 0.25)',
                    borderRadius: 6,
                    padding: '0 9px',
                    height: 30,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FFBDAD'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFEBE6'}
                >
                  <DeleteIcon label="Delete selected tasks" size="small" />
                </button>
              )}
            </>
          )}

          <Button appearance="primary" spacing="compact" onClick={onCreateSprint}>
            Create sprint
          </Button>
        </div>
      </div>

      {/* Task list */}
      {expanded && (
        <Droppable
          droppableId="backlog"
          type="TASK"
          renderClone={(provided, snapshot, rubric) => {
            const draggedTask = tasks[rubric.source.index];
            const isSelected = selectedTaskIds.includes(draggedTask?.id ?? '');

            if (isSelected && selectedTaskIds.length > 1) {
              return (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  style={provided.draggableProps.style as React.CSSProperties}
                >
                  <StackedDragPreview
                    tasks={tasks}
                    selectedTaskIds={selectedTaskIds}
                    draggedTaskId={draggedTask.id}
                    members={members}
                    customStatuses={customStatuses}
                  />
                </div>
              );
            }

            return (
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
                style={{
                  ...provided.draggableProps.style,
                  backgroundColor: 'var(--trella-surface)',
                  boxShadow: '0 12px 28px rgba(9, 30, 66, 0.25)',
                  borderRadius: 6,
                  border: '1.5px solid #0052CC',
                  overflow: 'hidden',
                }}
              >
                {draggedTask && (
                  <TaskRowContent
                    task={draggedTask}
                    members={members}
                    customStatuses={customStatuses}
                    isSelected={isSelected}
                    isDragging={true}
                  />
                )}
              </div>
            );
          }}
        >
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                backgroundColor: snapshot.isDraggingOver
                  ? 'rgba(0, 82, 204, 0.08)'
                  : 'var(--trella-surface)',
                outline: snapshot.isDraggingOver ? '2px dashed #0052CC' : 'none',
                minHeight: 40,
                transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
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
                    isSelected={selectedTaskIds.includes(task.id)}
                    onToggleSelect={onToggleSelectTask}
                    isDraggingMulti={isDraggingMulti}
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
