'use client';

import React, { useState, useRef } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import ShowMoreHorizontalIcon from '@atlaskit/icon/core/show-more-horizontal';
import DeleteIcon from '@atlaskit/icon/core/delete';
import ArrowLeftIcon from '@atlaskit/icon/core/arrow-left';
import type { SprintWithTasks, ProjectMemberPublic, CustomStatusPublic } from '@/lib/client';
import { SprintsService } from '@/lib/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import { ConfirmModal } from '@/components/ads/confirm-modal';
import { TaskRow, TaskRowContent, StackedDragPreview } from './task-row';
import { StartSprintModal } from './start-sprint-modal';
import { CompleteSprintModal } from './complete-sprint-modal';
import { InlineCreateTask } from './inline-create-task';

interface SprintSectionProps {
  sprint: SprintWithTasks;
  allSprints: SprintWithTasks[];
  projectId: string;
  workspaceId: string;
  members: ProjectMemberPublic[];
  customStatuses: CustomStatusPublic[];
  onTaskClick: (taskId: string) => void;
  boardId: string;
  todoColumnId: string;
  transitions?: any[];
  selectedTaskIds?: string[];
  onToggleSelectTask?: (taskId: string, shiftKey: boolean) => void;
  onToggleSectionTasks?: (taskIds: string[], selectAll: boolean) => void;
  onMoveSelectedToBacklog?: () => void;
  onDeleteSelected?: () => void;
  isDraggingMulti?: boolean;
}

type SprintMenu = 'rename' | 'edit-dates' | 'delete' | null;

export function SprintSection({
  sprint,
  allSprints,
  projectId,
  workspaceId,
  members,
  customStatuses,
  onTaskClick,
  boardId,
  todoColumnId,
  transitions = [],
  selectedTaskIds = [],
  onToggleSelectTask,
  onToggleSectionTasks,
  onMoveSelectedToBacklog,
  onDeleteSelected,
  isDraggingMulti = false,
}: SprintSectionProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<SprintMenu>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Rename state
  const [newName, setNewName] = useState(sprint.name);
  // Edit dates state
  const [startDate, setStartDate] = useState(sprint.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(sprint.endDate?.slice(0, 10) ?? '');

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; startDate?: string; endDate?: string }) =>
      SprintsService.Sprints_sprintsUpdateSprint({ sprintId: sprint.id, requestBody: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSprints(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      toast.success('Sprint updated');
      setActiveDialog(null);
    },
    onError: () => toast.error('Failed to update sprint'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => SprintsService.Sprints_sprintsDeleteSprint({ sprintId: sprint.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSprints(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      toast.success('Sprint deleted');
      setActiveDialog(null);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to delete sprint'),
  });

  const dateRange =
    sprint.startDate && sprint.endDate
      ? `${new Date(sprint.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${new Date(sprint.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
      : 'No dates set';

  const canDelete = sprint.status === 'PLANNED' && (sprint.tasks ?? []).length === 0;

  return (
    <>
      <div
        style={{
          border: `1px solid ${'var(--trella-border)'}`,
          borderRadius: 6,
          overflow: 'hidden',
          marginBottom: '16px',
        }}
      >
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
          {sprint.tasks && sprint.tasks.length > 0 && (
            <input
              type="checkbox"
              checked={sprint.tasks.length > 0 && sprint.tasks.every(t => selectedTaskIds.includes(t.id))}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSectionTasks?.(sprint.tasks!.map(t => t.id), e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
              title="Select all tasks in this sprint"
              style={{ cursor: 'pointer', width: 15, height: 15, flexShrink: 0 }}
            />
          )}

          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--trella-text)', whiteSpace: 'nowrap' }}>
            {sprint.name}
          </span>
          <span style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', whiteSpace: 'nowrap' }}>{dateRange}</span>
          <span style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', whiteSpace: 'nowrap' }}>
            ({(sprint.tasks ?? []).length} work items)
          </span>

          {/* Status badges */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            {(sprint.todoCount ?? 0) > 0 && (
              <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: '#8590A2', color: '#fff' }}>
                {sprint.todoCount}
              </span>
            )}
            {(sprint.inProgressCount ?? 0) > 0 && (
              <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: '#579DFF', color: '#fff' }}>
                {sprint.inProgressCount}
              </span>
            )}
            {(sprint.doneCount ?? 0) > 0 && (
              <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: '#4CAF50', color: '#fff' }}>
                {sprint.doneCount}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div
            style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const selectedInSprintCount = (sprint.tasks ?? []).filter(t => selectedTaskIds.includes(t.id)).length;
              if (selectedInSprintCount === 0) return null;
              return (
                <>
                  {onMoveSelectedToBacklog && (
                    <button
                      onClick={onMoveSelectedToBacklog}
                      title={`Chuyển ${selectedInSprintCount} công việc về Backlog`}
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
                      <ArrowLeftIcon label="Move" size="small" />
                      <span>Move to backlog</span>
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
                        {selectedInSprintCount}
                      </span>
                    </button>
                  )}
                  {onDeleteSelected && (
                    <button
                      onClick={onDeleteSelected}
                      title={`Xóa ${selectedInSprintCount} công việc đã chọn`}
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
              );
            })()}

            {sprint.status === 'ACTIVE' && (
              <Button appearance="default" spacing="compact" onClick={() => setShowCompleteModal(true)}>
                Complete sprint
              </Button>
            )}
            {sprint.status === 'PLANNED' && (
              <Button appearance="primary" spacing="compact" onClick={() => setShowStartModal(true)}>
                Start sprint
              </Button>
            )}

            {/* ... menu */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <Button
                appearance="subtle"
                spacing="compact"
                iconBefore={() => <ShowMoreHorizontalIcon label="more" size="small" />}
                onClick={() => setMenuOpen(m => !m)}
              >{' '}</Button>
              {menuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    zIndex: 100,
                    backgroundColor: 'var(--trella-surface)',
                    border: `1px solid ${'var(--trella-border)'}`,
                    borderRadius: 4,
                    boxShadow: '0 4px 16px rgba(9,30,66,0.18)',
                    minWidth: 160,
                  }}
                >
                  {[
                    { label: 'Rename sprint', action: 'rename' as SprintMenu },
                    { label: 'Edit dates', action: 'edit-dates' as SprintMenu },
                    ...(canDelete ? [{ label: 'Delete sprint', action: 'delete' as SprintMenu }] : []),
                  ].map(item => (
                    <div
                      key={item.action}
                      onClick={() => { setMenuOpen(false); setActiveDialog(item.action); }}
                      style={{
                        padding: '8px 12px',
                        fontSize: 13,
                        color: item.action === 'delete' ? '#FF5630' : 'var(--trella-text)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--trella-surface-selected)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                    >
                      {item.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Task list */}
        {expanded && (
          <Droppable
            droppableId={`sprint:${sprint.id}`}
            type="TASK"
            renderClone={(provided, snapshot, rubric) => {
              const sprintTasks = sprint.tasks ?? [];
              const draggedTask = sprintTasks[rubric.source.index];
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
                      tasks={sprintTasks}
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
                {(sprint.tasks ?? []).length === 0 ? (
                  <div style={{ margin: '8px 12px', border: '2px dashed var(--trella-border)', borderRadius: 6, padding: '18px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--trella-text-subtlest)' }}>
                      Plan a sprint by dragging work items into it, or by dragging the sprint footer.
                    </span>
                  </div>
                ) : (
                  (sprint.tasks ?? []).map((task, i) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      index={i}
                      droppableId={`sprint:${sprint.id}`}
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
            sprintId={sprint.id}
            workspaceId={workspaceId}
            projectId={projectId}
            projectMembers={members}
          />
        )}
      </div>

      {/* Modals */}
      {showStartModal && (
        <StartSprintModal sprint={sprint} allSprints={allSprints} projectId={projectId} workspaceId={workspaceId} onClose={() => setShowStartModal(false)} />
      )}
      {showCompleteModal && (
        <CompleteSprintModal sprint={sprint} allSprints={allSprints} projectId={projectId} workspaceId={workspaceId} onClose={() => setShowCompleteModal(false)} />
      )}

      <ConfirmModal
        isOpen={activeDialog === 'rename'}
        title="Rename sprint"
        confirmLabel="Save"
        confirmLoading={updateMutation.isPending}
        confirmDisabled={!newName.trim()}
        onConfirm={() => updateMutation.mutate({ name: newName })}
        onClose={() => setActiveDialog(null)}
        body={
          <Textfield value={newName} onChange={e => setNewName((e.target as HTMLInputElement).value)} autoFocus />
        }
      />

      <ConfirmModal
        isOpen={activeDialog === 'edit-dates'}
        title="Edit sprint dates"
        confirmLabel="Save"
        confirmLoading={updateMutation.isPending}
        onConfirm={() => updateMutation.mutate({ startDate: startDate || undefined, endDate: endDate || undefined })}
        onClose={() => setActiveDialog(null)}
        body={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Start date</label>
              <Textfield type="date" value={startDate} onChange={e => setStartDate((e.target as HTMLInputElement).value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>End date</label>
              <Textfield type="date" value={endDate} onChange={e => setEndDate((e.target as HTMLInputElement).value)} />
            </div>
          </div>
        }
      />

      <ConfirmModal
        isOpen={activeDialog === 'delete'}
        title="Delete sprint"
        appearance="danger"
        confirmLabel="Delete sprint"
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setActiveDialog(null)}
        body={
          <p style={{ margin: 0, fontSize: 14 }}>Are you sure you want to delete <strong>{sprint.name}</strong>? This action cannot be undone.</p>
        }
      />
    </>
  );
}
