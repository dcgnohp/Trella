'use client';

import React, { useState } from 'react';
import ModalDialog, { ModalBody, ModalFooter, ModalHeader, ModalTitle } from '@atlaskit/modal-dialog';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import TextArea from '@atlaskit/textarea';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SprintsService } from '@/lib/client';
import type { SprintWithTasks } from '@/lib/client';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';

interface StartSprintModalProps {
  sprint: SprintWithTasks;
  projectId: string;
  workspaceId: string;
  onClose: () => void;
}

export function StartSprintModal({ sprint, projectId, workspaceId, onClose }: StartSprintModalProps) {
  const queryClient = useQueryClient();
  const today = new Date();
  const twoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? '');
  const [startDate, setStartDate] = useState(today.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(twoWeeks.toISOString().slice(0, 10));

  const startMutation = useMutation({
    mutationFn: () =>
      SprintsService.Sprints_sprintsStartSprint({
        sprintId: sprint.id,
        requestBody: { name, goal: goal || null, startDate, endDate },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSprints(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      toast.success(`${name} started`);
      onClose();
    },
    onError: () => toast.error('Failed to start sprint'),
  });

  return (
    <ModalDialog onClose={onClose} width="medium">
      <ModalHeader>
        <ModalTitle>Start Sprint</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--trella-text)', display: 'block', marginBottom: 4 }}>
              Sprint name *
            </label>
            <Textfield value={name} onChange={e => setName((e.target as HTMLInputElement).value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--trella-text)', display: 'block', marginBottom: 4 }}>
              Sprint Goal
            </label>
            <TextArea
              value={goal}
              onChange={e => setGoal((e.target as HTMLTextAreaElement).value)}
              placeholder="Optional goal for this sprint"
              resize="smart"
              minimumRows={3}
            />
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--trella-text)', display: 'block', marginBottom: 4 }}>
                Start date *
              </label>
              <Textfield type="date" value={startDate} onChange={e => setStartDate((e.target as HTMLInputElement).value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--trella-text)', display: 'block', marginBottom: 4 }}>
                End date *
              </label>
              <Textfield type="date" value={endDate} onChange={e => setEndDate((e.target as HTMLInputElement).value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', margin: 0 }}>
            {(sprint.tasks ?? []).length} work items will be included in this sprint.
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button appearance="subtle" onClick={onClose}>Cancel</Button>
        <Button
          appearance="primary"
          isLoading={startMutation.isPending}
          isDisabled={!name || !startDate || !endDate}
          onClick={() => startMutation.mutate()}
        >
          Start sprint
        </Button>
      </ModalFooter>
    </ModalDialog>
  );
}
