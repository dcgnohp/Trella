'use client';

import React, { useState } from 'react';
import { Box, Stack, Inline, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';
import Button from '@atlaskit/button/new';
import ModalDialog, { ModalBody, ModalFooter, ModalHeader, ModalTitle } from '@atlaskit/modal-dialog';
import Select from '@atlaskit/select';
import Badge from '@atlaskit/badge';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';

import type { TaskPublic } from '@/lib/client';
import { StatusLozenge } from '@/components/ads/status-lozenge';
import type { CanonicalStatus } from '@/lib/status/display-style';

interface BacklogSectionProps {
  tasks: TaskPublic[];
}

export function BacklogSection({ tasks }: BacklogSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [showCreateSprint, setShowCreateSprint] = useState(false);

  return (
    <div style={{
      border: `1px solid ${token('color.border')}`,
      borderRadius: '6px',
      overflow: 'hidden',
    }}>
      <div
        style={{
          padding: `${token('space.150')} ${token('space.300')}`,
          backgroundColor: token('elevation.surface'),
          display: 'flex', alignItems: 'center', gap: token('space.200'), cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ display: 'flex', alignItems: 'center', color: token('color.text.subtlest'), userSelect: 'none' }}>
          {expanded ? <ChevronDownIcon label="" size="small" /> : <ChevronRightIcon label="" size="small" />}
        </span>
        <Text weight="bold" size="small" color="color.text">Backlog</Text>
        <Text size="small" color="color.text.subtlest">({tasks.length} work items)</Text>
        <div style={{ marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
          <Button appearance="primary" spacing="compact" onClick={() => setShowCreateSprint(true)}>
            Create sprint
          </Button>
        </div>
      </div>

      {expanded && (
        <div>
          {tasks.length === 0 ? (
            <div style={{ padding: token('space.400'), textAlign: 'center' }}>
              <Text size="small" color="color.text.subtlest">No items in backlog</Text>
            </div>
          ) : (
            tasks.map((task, i) => (
              <BacklogTaskRow key={task.id} task={task} isLast={i === tasks.length - 1} />
            ))
          )}
          <div style={{ padding: token('space.200'), borderTop: `1px solid ${token('color.border')}` }}>
            <Button appearance="subtle" spacing="compact">+ Create issue</Button>
          </div>
        </div>
      )}

      {showCreateSprint && (
        <ModalDialog onClose={() => setShowCreateSprint(false)}>
          <ModalHeader>
            <ModalTitle>Create sprint</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Text size="small" color="color.text.subtle">
              A new sprint will be created. Add dates and issues once the sprint is created.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button appearance="subtle" onClick={() => setShowCreateSprint(false)}>Cancel</Button>
            <Button appearance="primary" onClick={() => {
              setShowCreateSprint(false);
              // TODO: POST /sprints
            }}>
              Create sprint
            </Button>
          </ModalFooter>
        </ModalDialog>
      )}
    </div>
  );
}

function BacklogTaskRow({ task, isLast }: { task: TaskPublic; isLast: boolean }) {
  const canonicalStatus = (task.customStatus?.canonicalStatus ?? 'TODO') as CanonicalStatus;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '24px 1fr 140px auto auto',
      alignItems: 'center',
      gap: token('space.150'),
      padding: `${token('space.100')} ${token('space.300')}`,
      borderBottom: isLast ? 'none' : `1px solid ${token('color.border')}`,
      cursor: 'pointer',
    }}>
      <div style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: token('color.background.neutral'), flexShrink: 0 }} />
      <Text size="small" color="color.text">{task.title}</Text>
      <StatusLozenge status={canonicalStatus} label={task.customStatus?.name ?? canonicalStatus} />
      <Text size="small" color="color.text.subtlest">
        {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '—'}
      </Text>
      <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: token('color.background.neutral'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text size="small" color="color.text.subtlest">{task.assigneeId ? task.assigneeId[0].toUpperCase() : '?'}</Text>
      </div>
    </div>
  );
}
