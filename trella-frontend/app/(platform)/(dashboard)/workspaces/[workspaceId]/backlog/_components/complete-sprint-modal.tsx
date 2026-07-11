'use client';

import React, { useState } from 'react';
import Select from '@atlaskit/select';
import { ConfirmModal } from '@/components/ads/confirm-modal';
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
    <ConfirmModal
      isOpen
      title={`🏆 Complete ${sprint.name}`}
      width={560}
      confirmLabel="Complete sprint"
      confirmLoading={completeMutation.isPending}
      onConfirm={() => completeMutation.mutate()}
      onClose={onClose}
      body={
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
                menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                styles={{ menuPortal: base => ({ ...base, zIndex: 1100 }) }}
              />
            </div>
          )}
        </div>
      }
    />
  );
}
