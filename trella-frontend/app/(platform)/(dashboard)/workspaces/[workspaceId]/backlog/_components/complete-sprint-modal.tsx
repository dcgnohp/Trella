'use client';

import React, { useState } from 'react';
import ModalDialog, { ModalBody, ModalFooter, ModalHeader, ModalTitle } from '@atlaskit/modal-dialog';
import Button from '@atlaskit/button/new';
import Select from '@atlaskit/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SprintsService } from '@/lib/client';
import type { SprintWithTasks } from '@/lib/client';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';

interface CompleteSprintModalProps {
  sprint: SprintWithTasks;
  allSprints: SprintWithTasks[];
  projectId: string;
  workspaceId: string;
  onClose: () => void;
}

export function CompleteSprintModal({ sprint, allSprints, projectId, workspaceId, onClose }: CompleteSprintModalProps) {
  const queryClient = useQueryClient();
  const openCount = (sprint.tasks ?? []).filter(t => (t.customStatus?.canonicalStatus ?? 'TODO') !== 'DONE').length;
  const doneCount = sprint.doneCount;

  const plannedSprints = allSprints.filter(s => s.status === 'PLANNED' && s.id !== sprint.id);
  const moveOptions = [
    { label: 'Backlog', value: 'backlog' },
    ...plannedSprints.map(s => ({ label: s.name, value: s.id })),
  ];
  const [moveTo, setMoveTo] = useState<{ label: string; value: string }>(moveOptions[0]);

  const completeMutation = useMutation({
    mutationFn: () =>
      SprintsService.Sprints_sprintsCompleteSprint({
        sprintId: sprint.id,
        requestBody: { moveOpenTo: moveTo.value },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSprints(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectBacklog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      toast.success(`${sprint.name} completed`);
      onClose();
    },
    onError: () => toast.error('Failed to complete sprint'),
  });

  return (
    <ModalDialog onClose={onClose} width="medium">
      <ModalHeader>
        <ModalTitle>
          <span style={{ fontSize: 20 }}>🏆</span>{' '}Complete {sprint.name}
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--trella-text)' }}>
            This sprint contains <strong>{doneCount} completed</strong> and <strong>{openCount} open</strong> work items.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--trella-text-subtle)', lineHeight: 1.6 }}>
            <li>Completed work items includes everything in the last column on the board, Done.</li>
            <li>Open work items includes everything from any other column on the board. Move these to a new sprint or the backlog.</li>
          </ul>
          {openCount > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--trella-text)', display: 'block', marginBottom: 4 }}>
                Move open work items to
              </label>
              <Select
                options={moveOptions}
                value={moveTo}
                onChange={opt => opt && setMoveTo(opt as { label: string; value: string })}
                menuPlacement="auto"
              />
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button appearance="subtle" onClick={onClose}>Cancel</Button>
        <Button
          appearance="primary"
          isLoading={completeMutation.isPending}
          onClick={() => completeMutation.mutate()}
        >
          Complete sprint
        </Button>
      </ModalFooter>
    </ModalDialog>
  );
}
