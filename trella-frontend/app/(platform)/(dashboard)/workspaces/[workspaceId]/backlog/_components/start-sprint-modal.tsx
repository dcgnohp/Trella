'use client';

import React, { useState } from 'react';
import Textfield from '@atlaskit/textfield';
import TextArea from '@atlaskit/textarea';
import { ConfirmModal } from '@/components/ads/confirm-modal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SprintsService } from '@/lib/client';
import type { SprintWithTasks } from '@/lib/client';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';

interface StartSprintModalProps {
  sprint: SprintWithTasks;
  allSprints?: SprintWithTasks[];
  projectId: string;
  workspaceId: string;
  onClose: () => void;
}

export function StartSprintModal({ sprint, allSprints = [], projectId, workspaceId, onClose }: StartSprintModalProps) {
  const queryClient = useQueryClient();
  const today = new Date();
  const twoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  const activeSprint = allSprints.find(s => s.status === 'ACTIVE' && s.id !== sprint.id);

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
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.body?.detail || err?.message || 'Failed to start sprint';
      toast.error(detail);
    },
  });

  return (
    <ConfirmModal
      isOpen
      title="Start Sprint"
      width={560}
      confirmLabel="Start sprint"
      confirmLoading={startMutation.isPending}
      confirmDisabled={!name || !startDate || !endDate || !!activeSprint}
      onConfirm={() => startMutation.mutate()}
      onClose={onClose}
      body={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeSprint && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 6,
                backgroundColor: '#FFFAE6',
                border: '1px solid #FFE380',
                color: '#172B4D',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              ⚠️ <strong>Cannot start sprint:</strong> Sprint <strong>{activeSprint.name}</strong> is currently active.
              Only one sprint can be active at a time. Please complete <strong>{activeSprint.name}</strong> before starting a new sprint.
            </div>
          )}
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
      }
    />
  );
}
