'use client';

import React from 'react';
import { Box, Stack, Inline, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';
import PageHeader from '@atlaskit/page-header';
import SectionMessage from '@atlaskit/section-message';
import Button from '@atlaskit/button/new';
import ProgressBar from '@atlaskit/progress-bar';
import { useQuery } from '@tanstack/react-query';
import { BoardsService } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import type { TaskPublic } from '@/lib/client';
import CheckMarkIcon from '@atlaskit/icon/core/check-mark';
import EditIcon from '@atlaskit/icon/core/edit';
import WorkItemsIcon from '@atlaskit/icon/core/work-items';
import CalendarIcon from '@atlaskit/icon/core/calendar';

// ponytail: inline SVG donut instead of recharts to avoid bundling the full library for a single chart
function DonutChart({ done, total }: { done: number; total: number }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const doneFraction = total > 0 ? done / total : 0;
  const inProgressFraction = total > 0 ? 0.3 : 0;

  return (
    <div style={{ position: 'relative', width: 140, height: 140 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke={token('color.border')} strokeWidth="16" />
        <circle cx="70" cy="70" r={r} fill="none"
          stroke={token('color.background.discovery.bold')}
          strokeWidth="16"
          strokeDasharray={`${inProgressFraction * circumference} ${circumference}`}
          strokeDashoffset={circumference * 0.25}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px' }}
        />
        <circle cx="70" cy="70" r={r} fill="none"
          stroke={token('color.background.success.bold')}
          strokeWidth="16"
          strokeDasharray={`${doneFraction * circumference} ${circumference}`}
          strokeDashoffset={-inProgressFraction * circumference + circumference * 0.25}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Text weight="bold" color="color.text">{total}</Text>
        <Text size="small" color="color.text.subtlest">total</Text>
      </div>
    </div>
  );
}

function StatCard({ icon, count, label, sublabel }: { icon: React.ReactNode; count: number; label: string; sublabel: string }) {
  return (
    <Box
      padding="space.300"
      style={{
        backgroundColor: token('elevation.surface.raised'),
        borderRadius: '6px',
        boxShadow: token('elevation.shadow.raised'),
        flex: 1,
      }}
    >
      <Stack space="space.150">
        <Inline space="space.150" alignBlock="center">
          <span style={{ display: 'flex', alignItems: 'center', color: '#5E6C84' }}>{icon}</span>
          <Text weight="bold" color="color.text" size="large">{count}</Text>
        </Inline>
        <Text size="small" weight="medium" color="color.text">{label}</Text>
        <Text size="small" color="color.text.subtlest">{sublabel}</Text>
      </Stack>
    </Box>
  );
}

interface SummaryPageClientProps {
  workspaceId: string;
}

export function SummaryPageClient({ workspaceId }: SummaryPageClientProps) {
  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
  });
  const firstBoardId = boardsQuery.data?.[0]?.id;

  const tasksQuery = useQuery({
    queryKey: queryKeys.boardTasks(firstBoardId ?? ''),
    queryFn: () => BoardsService.Boards_boardsListBoardTasks({ boardId: firstBoardId! }),
    enabled: !!firstBoardId,
  });

  const tasks = tasksQuery.data ?? [];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const done = tasks.filter(t => t.customStatus?.canonicalStatus === 'DONE');
  const updated = tasks.filter(t => new Date(t.updatedAt) >= weekAgo);
  const created = tasks.filter(t => new Date(t.createdAt) >= weekAgo);
  const dueSoon = tasks.filter(t => t.dueDate && new Date(t.dueDate) <= weekAhead && new Date(t.dueDate) >= now);

  const inProgress = tasks.filter(t => t.customStatus?.canonicalStatus === 'IN_PROGRESS').length;
  const todo = tasks.filter(t => t.customStatus?.canonicalStatus === 'TODO').length;
  const doneCount = done.length;

  const priorityGroups = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map(p => ({
    label: p,
    count: tasks.filter(t => t.priority === p).length,
  }));

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: `${token('space.400')} ${token('space.500')}` }}>
        <PageHeader>Summary</PageHeader>

        <Box paddingBlockEnd="space.400">
          <SectionMessage appearance="information" title="Customize your Reports view">
            <Text size="small">Use filters to narrow down data and track your team&apos;s progress.</Text>
          </SectionMessage>
        </Box>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: token('space.200'), marginBottom: token('space.400') }}>
          <StatCard icon={<CheckMarkIcon label="" size="small" />} count={done.length} label="Completed" sublabel="in last 7 days" />
          <StatCard icon={<EditIcon label="" size="small" />} count={updated.length} label="Updated" sublabel="in last 7 days" />
          <StatCard icon={<WorkItemsIcon label="" size="small" />} count={created.length} label="Created" sublabel="in last 7 days" />
          <StatCard icon={<CalendarIcon label="" size="small" />} count={dueSoon.length} label="Due soon" sublabel="in next 7 days" />
        </div>

        {/* Status overview + activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: token('space.300'), marginBottom: token('space.400') }}>
          {/* Status donut */}
          <Box padding="space.300" style={{ backgroundColor: token('elevation.surface.raised'), borderRadius: '6px', boxShadow: token('elevation.shadow.raised') }}>
            <Stack space="space.300">
              <Text weight="medium" color="color.text">Status overview</Text>
              <Inline space="space.400" alignBlock="center">
                <DonutChart done={doneCount} total={tasks.length} />
                <Stack space="space.150">
                  <LegendItem color={token('color.background.success.bold')} label="Done" count={doneCount} />
                  <LegendItem color={token('color.background.discovery.bold')} label="In Progress" count={inProgress} />
                  <LegendItem color={token('color.border')} label="To Do" count={todo} />
                </Stack>
              </Inline>
            </Stack>
          </Box>

          {/* Recent activity */}
          <Box padding="space.300" style={{ backgroundColor: token('elevation.surface.raised'), borderRadius: '6px', boxShadow: token('elevation.shadow.raised') }}>
            <Stack space="space.200">
              <Text weight="medium" color="color.text">Recent activity</Text>
              <Text size="small" weight="bold" color="color.text.subtlest">TODAY</Text>
              {tasks.slice(0, 4).map(t => (
                <Inline key={t.id} space="space.150" alignBlock="center">
                  <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: token('color.background.brand.subtlest'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Text size="small" color="color.text.brand">{t.assigneeId?.[0]?.toUpperCase() ?? '?'}</Text>
                  </div>
                  <Text size="small" color="color.text.subtle">updated <span style={{ color: token('color.text') }}>{t.title}</span></Text>
                </Inline>
              ))}
              {tasks.length === 0 && <Text size="small" color="color.text.subtlest">No recent activity</Text>}
            </Stack>
          </Box>
        </div>

        {/* Priority + Work types */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: token('space.300') }}>
          <Box padding="space.300" style={{ backgroundColor: token('elevation.surface.raised'), borderRadius: '6px', boxShadow: token('elevation.shadow.raised') }}>
            <Stack space="space.200">
              <Text weight="medium" color="color.text">Priority breakdown</Text>
              {priorityGroups.map(({ label, count }) => (
                <Stack key={label} space="space.075">
                  <Inline spread="space-between">
                    <Text size="small" color="color.text.subtle">{label}</Text>
                    <Text size="small" color="color.text.subtlest">{count}</Text>
                  </Inline>
                  <ProgressBar value={tasks.length > 0 ? count / tasks.length : 0} appearance="success" />
                </Stack>
              ))}
            </Stack>
          </Box>

          <Box padding="space.300" style={{ backgroundColor: token('elevation.surface.raised'), borderRadius: '6px', boxShadow: token('elevation.shadow.raised') }}>
            <Stack space="space.200">
              <Text weight="medium" color="color.text">Types of work</Text>
              <Text size="small" color="color.text.subtlest">{tasks.length} total work items</Text>
              {[{ label: 'Task', count: tasks.length }].map(({ label, count }) => (
                <Stack key={label} space="space.075">
                  <Inline spread="space-between">
                    <Text size="small" color="color.text.subtle">{label}</Text>
                    <Text size="small" color="color.text.subtlest">{count}</Text>
                  </Inline>
                  <ProgressBar value={1} appearance="inverse" />
                </Stack>
              ))}
            </Stack>
          </Box>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <Inline space="space.150" alignBlock="center">
      <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
      <Text size="small" color="color.text.subtle">{label}</Text>
      <Text size="small" color="color.text.subtlest">{count}</Text>
    </Inline>
  );
}
