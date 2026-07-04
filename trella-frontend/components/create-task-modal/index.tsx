'use client';

import React, { useState } from 'react';
import Modal, { ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition } from '@atlaskit/modal-dialog';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import Select from '@atlaskit/select';
import { AsyncSelect } from '@atlaskit/select';
import { Label } from '@atlaskit/form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BoardsService,
  ColumnsService,
  CustomStatusesService,
  WorkspaceMembersService,
  TasksService,
} from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

const WORK_TYPES = [
  { label: 'Task', value: 'TASK' },
  { label: 'Bug', value: 'BUG' },
  { label: 'Story', value: 'STORY' },
  { label: 'Subtask', value: 'SUBTASK' },
];

const PRIORITIES = [
  { label: 'Urgent', value: 'URGENT' },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

interface CreateTaskModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTaskModal({ workspaceId, isOpen, onClose }: CreateTaskModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<{ label: string; value: string } | null>(WORK_TYPES[0]);
  const [priority, setPriority] = useState<{ label: string; value: string } | null>(PRIORITIES[2]);
  const [statusId, setStatusId] = useState<{ label: string; value: string } | null>(null);
  const [assigneeId, setAssigneeId] = useState<{ label: string; value: string } | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [createAnother, setCreateAnother] = useState(false);

  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
    enabled: isOpen,
  });
  const firstBoardId = boardsQuery.data?.[0]?.id ?? null;

  const columnsQuery = useQuery({
    queryKey: queryKeys.boardColumns(firstBoardId ?? ''),
    queryFn: () => ColumnsService.Columns_columnsListColumns({ boardId: firstBoardId! }),
    enabled: !!firstBoardId,
  });
  const firstColumnId = columnsQuery.data?.[0]?.id ?? null;

  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId }),
    enabled: isOpen,
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId }),
    enabled: isOpen,
  });

  const statusOptions = (customStatusesQuery.data ?? []).map(s => ({
    label: s.name,
    value: s.id,
  }));

  const memberOptions = (membersQuery.data ?? []).map(m => ({
    label: m.fullName ?? m.email,
    value: m.userId,
  }));

  const loadMemberOptions = async (inputValue: string) => {
    return memberOptions.filter(m =>
      m.label.toLowerCase().includes(inputValue.toLowerCase())
    );
  };

  const loadStatusOptions = async (inputValue: string) => {
    return statusOptions.filter(s =>
      s.label.toLowerCase().includes(inputValue.toLowerCase())
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!firstBoardId || !firstColumnId) throw new Error('No board/column found');
      const task = await ColumnsService.Columns_columnsCreateTask({
        boardId: firstBoardId,
        columnId: firstColumnId,
        requestBody: {
          title,
          type: type?.value ?? 'TASK',
          dueDate: dueDate || null,
          assigneeId: assigneeId?.value ?? null,
        },
      });
      if (priority?.value || statusId?.value) {
        await TasksService.Tasks_tasksUpdateTask({
          taskId: task.id,
          requestBody: {
            priority: priority?.value ?? undefined,
            customStatusId: statusId?.value ?? undefined,
          },
        });
      }
      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      if (firstBoardId) queryClient.invalidateQueries({ queryKey: queryKeys.boardTasks(firstBoardId) });
      toast.success('Task created');
      if (createAnother) {
        setTitle('');
        setStatusId(null);
        setAssigneeId(null);
        setDueDate('');
      } else {
        handleClose();
      }
    },
    onError: () => toast.error('Failed to create task'),
  });

  const handleClose = () => {
    setTitle('');
    setType(WORK_TYPES[0]);
    setPriority(PRIORITIES[2]);
    setStatusId(null);
    setAssigneeId(null);
    setDueDate('');
    onClose();
  };

  const canSubmit = title.trim().length > 0 && !!firstBoardId && !!firstColumnId;

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={handleClose} width="medium">
          <ModalHeader>
            <ModalTitle>Create Task</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <Label htmlFor="task-type">Work type</Label>
                <Select
                  inputId="task-type"
                  options={WORK_TYPES}
                  value={type}
                  onChange={v => setType(v)}
                />
              </div>

              <div>
                <Label htmlFor="task-status">Status</Label>
                <AsyncSelect
                  inputId="task-status"
                  cacheOptions
                  defaultOptions={statusOptions}
                  loadOptions={loadStatusOptions}
                  value={statusId}
                  onChange={v => setStatusId(v)}
                  placeholder="Select status"
                  isClearable
                />
              </div>

              <div>
                <Label htmlFor="task-title">
                  Summary <span style={{ color: 'var(--ds-text-danger, #FF5630)' }}>*</span>
                </Label>
                <Textfield
                  id="task-title"
                  value={title}
                  onChange={e => setTitle((e.target as HTMLInputElement).value)}
                  placeholder="Enter task summary"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="task-assignee">Assignee</Label>
                <AsyncSelect
                  inputId="task-assignee"
                  cacheOptions
                  defaultOptions={memberOptions}
                  loadOptions={loadMemberOptions}
                  value={assigneeId}
                  onChange={v => setAssigneeId(v)}
                  placeholder="Automatic"
                  isClearable
                />
              </div>

              <div>
                <Label htmlFor="task-priority">Priority</Label>
                <Select
                  inputId="task-priority"
                  options={PRIORITIES}
                  value={priority}
                  onChange={v => setPriority(v)}
                />
              </div>

              <div>
                <Label htmlFor="task-due-date">Due date</Label>
                <Textfield
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate((e.target as HTMLInputElement).value)}
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <input
                id="create-another"
                type="checkbox"
                checked={createAnother}
                onChange={e => setCreateAnother(e.target.checked)}
              />
              <label htmlFor="create-another" style={{ fontSize: 14, cursor: 'pointer' }}>
                Create another
              </label>
            </div>
            <Button appearance="subtle" onClick={handleClose}>Cancel</Button>
            <Button
              appearance="primary"
              isDisabled={!canSubmit}
              isLoading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}
