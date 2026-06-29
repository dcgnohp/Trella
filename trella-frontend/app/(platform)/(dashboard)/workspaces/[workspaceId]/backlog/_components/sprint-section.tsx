'use client';

import React, { useState } from 'react';
import { Box, Stack, Inline, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge';
import Avatar from '@atlaskit/avatar';
import Badge from '@atlaskit/badge';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';

import type { TaskPublic } from '@/lib/client';
import { StatusLozenge } from '@/components/ads/status-lozenge';
import type { CanonicalStatus } from '@/lib/status/display-style';

// ponytail: mock sprint data until BE endpoint exists
interface Sprint {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status: 'active' | 'planned' | 'completed';
  tasks: TaskPublic[];
}

interface SprintSectionProps {
  sprint: Sprint;
  onCompleteSprintClick?: (sprint: Sprint) => void;
  onStartSprintClick?: (sprint: Sprint) => void;
}

export function SprintSection({ sprint, onCompleteSprintClick, onStartSprintClick }: SprintSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const dateRange = sprint.startDate && sprint.endDate
    ? `${new Date(sprint.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${new Date(sprint.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
    : 'No dates';

  const doneCount = sprint.tasks.filter(t => t.customStatus?.canonicalStatus === 'DONE').length;
  const todoCount = sprint.tasks.filter(t => t.customStatus?.canonicalStatus === 'TODO').length;
  const inProgressCount = sprint.tasks.filter(t => t.customStatus?.canonicalStatus === 'IN_PROGRESS').length;

  return (
    <div style={{
      marginBottom: token('space.300'),
      border: `1px solid ${token('color.border')}`,
      borderRadius: '6px',
      overflow: 'hidden',
    }}>
      {/* Sprint header */}
      <div style={{
        padding: `${token('space.150')} ${token('space.300')}`,
        backgroundColor: token('elevation.surface'),
        display: 'flex',
        alignItems: 'center',
        gap: token('space.200'),
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <span style={{ display: 'flex', alignItems: 'center', color: token('color.text.subtlest'), userSelect: 'none' }}>
          {expanded ? <ChevronDownIcon label="" size="small" /> : <ChevronRightIcon label="" size="small" />}
        </span>
        <Text weight="bold" size="small" color="color.text">{sprint.name}</Text>
        <Text size="small" color="color.text.subtlest">{dateRange}</Text>
        <Text size="small" color="color.text.subtlest">({sprint.tasks.length} work items)</Text>

        {/* Mini status badges */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {todoCount > 0 && <Badge appearance="default">{todoCount}</Badge>}
          {inProgressCount > 0 && <Badge appearance="primary">{inProgressCount}</Badge>}
          {doneCount > 0 && <Badge appearance="added">{doneCount}</Badge>}
        </div>

        <div onClick={e => e.stopPropagation()}>
          {sprint.status === 'active' && onCompleteSprintClick && (
            <Button appearance="default" spacing="compact" onClick={() => onCompleteSprintClick(sprint)}>
              Complete sprint
            </Button>
          )}
          {sprint.status === 'planned' && onStartSprintClick && (
            <Button appearance="primary" spacing="compact" onClick={() => onStartSprintClick(sprint)}>
              Start sprint
            </Button>
          )}
        </div>
      </div>

      {/* Task rows */}
      {expanded && (
        <div style={{ backgroundColor: token('elevation.surface') }}>
          {sprint.tasks.length === 0 ? (
            <div style={{
              padding: token('space.400'),
              textAlign: 'center',
              border: `2px dashed ${token('color.border')}`,
              margin: token('space.200'),
              borderRadius: '3px',
            }}>
              <Text size="small" color="color.text.subtlest">
                Plan a sprint by dragging work items into it
              </Text>
            </div>
          ) : (
            sprint.tasks.map((task, i) => (
              <TaskRow key={task.id} task={task} index={i} total={sprint.tasks.length} />
            ))
          )}
          <div style={{ padding: token('space.200'), borderTop: `1px solid ${token('color.border')}` }}>
            <Button appearance="subtle" spacing="compact">+ Create issue</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, index, total }: { task: TaskPublic; index: number; total: number }) {
  const canonicalStatus = (task.customStatus?.canonicalStatus ?? 'TODO') as CanonicalStatus;
  const isLast = index === total - 1;

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
      {/* Type icon placeholder */}
      <div style={{
        width: 16, height: 16, borderRadius: 3,
        backgroundColor: token('color.background.brand.bold'),
        flexShrink: 0,
      }} />

      {/* Title */}
      <Text size="small" color="color.text">{task.title}</Text>

      {/* Status */}
      <StatusLozenge status={canonicalStatus} label={task.customStatus?.name ?? canonicalStatus} />

      {/* Due date */}
      <Text size="small" color="color.text.subtlest">
        {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '—'}
      </Text>

      {/* Assignee */}
      <Avatar size="xsmall" name={task.assigneeId ?? 'Unassigned'} />
    </div>
  );
}
