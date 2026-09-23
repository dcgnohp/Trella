'use client';

import React from 'react';
import { Box, Stack, Inline, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';
import PageHeader from '@atlaskit/page-header';
import DynamicTable from '@atlaskit/dynamic-table';
import ProgressBar from '@atlaskit/progress-bar';
import Avatar from '@atlaskit/avatar';
import Badge from '@atlaskit/badge';
import SectionMessage from '@atlaskit/section-message';
import Button from '@atlaskit/button/new';
import { useQuery } from '@tanstack/react-query';
import { BoardsService, ProjectMembersService } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { StatusLozenge } from '@/components/ads/status-lozenge';
import type { CanonicalStatus } from '@/lib/status/display-style';

function AdminStatCard({ icon, count, label, sublabel, trendUp }: { icon: string; count: number; label: string; sublabel?: string; trendUp?: boolean }) {
  return (
    <Box padding="space.300" style={{
      backgroundColor: token('elevation.surface.raised'),
      borderRadius: '6px',
      boxShadow: token('elevation.shadow.raised'),
      flex: 1,
    }}>
      <Stack space="space.150">
        <Inline space="space.150" alignBlock="center">
          <span style={{ fontSize: 22 }}>{icon}</span>
          <Text weight="bold" color="color.text" size="large">{count}</Text>
          {trendUp !== undefined && (
            <span style={{ fontSize: 11, color: trendUp ? token('color.text.success') : token('color.text.danger') }}>
              {trendUp ? '↑' : '↓'}
            </span>
          )}
        </Inline>
        <Text size="small" weight="medium" color="color.text">{label}</Text>
        {sublabel && <Text size="small" color="color.text.subtlest">{sublabel}</Text>}
      </Stack>
    </Box>
  );
}

// ponytail: SVG donut reused from summary page
function MiniDonut({ value, size = 60 }: { value: number; size?: number }) {
  const r = (size / 2) - 8;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={token('color.border')} strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={token('color.background.success.bold')}
        strokeWidth="8"
        strokeDasharray={`${value * c} ${c}`}
        style={{ transform: `rotate(-90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}
      />
    </svg>
  );
}

interface AdminDashboardClientProps {
  workspaceId: string;
  userRole: string;
}

export function AdminDashboardClient({ workspaceId, userRole }: AdminDashboardClientProps) {
  if (userRole !== 'ADMIN' && userRole !== 'OWNER') {
    return (
      <div style={{ padding: token('space.500') }}>
        <SectionMessage appearance="error" title="Access denied">
          <Text size="small">You need Admin or Owner role to view this page.</Text>
        </SectionMessage>
      </div>
    );
  }

  return <AdminDashboardContent workspaceId={workspaceId} />;
}

function AdminDashboardContent({ workspaceId }: { workspaceId: string }) {
  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
  });
  const firstBoardId = boardsQuery.data?.[0]?.id;
  const firstProjectId = boardsQuery.data?.[0]?.projectId;

  const tasksQuery = useQuery({
    queryKey: queryKeys.boardTasks(firstBoardId ?? ''),
    queryFn: () => BoardsService.Boards_boardsListBoardTasks({ boardId: firstBoardId! }),
    enabled: !!firstBoardId,
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(firstProjectId ?? ''),
    queryFn: () => ProjectMembersService.ProjectMembers_projectMembersListMembers({ projectId: firstProjectId! }),
    enabled: !!firstProjectId,
  });

  const tasks = tasksQuery.data ?? [];
  const members = membersQuery.data ?? [];

  const done = tasks.filter(t => t.customStatus?.canonicalStatus === 'DONE').length;
  const inProgress = tasks.filter(t => t.customStatus?.canonicalStatus === 'IN_PROGRESS').length;
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.customStatus?.canonicalStatus !== 'DONE').length;
  const completionRate = tasks.length > 0 ? done / tasks.length : 0;

  // Remaining tasks table
  const remaining = tasks.filter(t => t.customStatus?.canonicalStatus !== 'DONE');

  const tableHead = {
    cells: [
      { content: 'Task', key: 'title', isSortable: true },
      { content: 'Status', key: 'status' },
      { content: 'Priority', key: 'priority' },
      { content: 'Due date', key: 'dueDate', isSortable: true },
      { content: 'Assignee', key: 'assignee' },
    ],
  };

  const tableRows = remaining.map(task => ({
    key: task.id,
    cells: [
      { content: <Text size="small" color="color.text">{task.title}</Text> },
      { content: <StatusLozenge status={(task.customStatus?.canonicalStatus ?? 'TODO') as CanonicalStatus} label={task.customStatus?.name ?? 'To Do'} /> },
      { content: <Text size="small" color="color.text.subtle">{task.priority ?? '—'}</Text> },
      { content: <Text size="small" color="color.text.subtle">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}</Text> },
      { content: (
        <Inline space="space.100" alignBlock="center">
          <Avatar size="xsmall" name={task.assigneeId ?? '?'} />
          <Text size="small" color="color.text.subtle">{task.assigneeId ? task.assigneeId.slice(0, 8) : 'Unassigned'}</Text>
        </Inline>
      )},
    ],
  }));

  // Per-member performance
  const memberPerf = members.map(member => {
    const assigned = tasks.filter(t => t.assigneeId === member.userId).length;
    const completed = tasks.filter(t => t.assigneeId === member.userId && t.customStatus?.canonicalStatus === 'DONE').length;
    const rate = assigned > 0 ? completed / assigned : 0;
    return { member, assigned, completed, rate };
  });

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${token('space.400')} ${token('space.500')}` }}>
        <PageHeader>Team Dashboard</PageHeader>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: token('space.200'), marginBottom: token('space.400') }}>
          <AdminStatCard icon="📋" count={tasks.length} label="Total assigned" />
          <AdminStatCard icon="✅" count={done} label="Completed" sublabel={`${Math.round(completionRate * 100)}% completion rate`} trendUp={completionRate > 0.5} />
          <AdminStatCard icon="⚙️" count={inProgress} label="In Progress" />
          <AdminStatCard icon="⚠️" count={overdue} label="Overdue" trendUp={false} />
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: token('space.300'), marginBottom: token('space.400') }}>
          {/* Task completion donut */}
          <Box padding="space.300" style={{ backgroundColor: token('elevation.surface.raised'), borderRadius: '6px', boxShadow: token('elevation.shadow.raised') }}>
            <Stack space="space.300">
              <Text weight="medium" color="color.text">Task Completion</Text>
              <Inline space="space.400" alignBlock="center">
                <MiniDonut value={completionRate} size={100} />
                <Stack space="space.150">
                  <Inline space="space.100" alignBlock="center">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: token('color.background.success.bold') }} />
                    <Text size="small" color="color.text.subtle">Done: {done}</Text>
                  </Inline>
                  <Inline space="space.100" alignBlock="center">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: token('color.border') }} />
                    <Text size="small" color="color.text.subtle">Remaining: {tasks.length - done}</Text>
                  </Inline>
                </Stack>
              </Inline>
            </Stack>
          </Box>

          {/* Task distribution */}
          <Box padding="space.300" style={{ backgroundColor: token('elevation.surface.raised'), borderRadius: '6px', boxShadow: token('elevation.shadow.raised') }}>
            <Stack space="space.200">
              <Text weight="medium" color="color.text">Task Distribution</Text>
              {[
                { label: 'To Do', count: tasks.filter(t => t.customStatus?.canonicalStatus === 'TODO').length, color: token('color.background.neutral.bold') },
                { label: 'In Progress', count: inProgress, color: token('color.background.brand.bold') },
                { label: 'Done', count: done, color: token('color.background.success.bold') },
              ].map(({ label, count, color }) => (
                <Stack key={label} space="space.075">
                  <Inline spread="space-between">
                    <Inline space="space.100" alignBlock="center">
                      <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
                      <Text size="small" color="color.text.subtle">{label}</Text>
                    </Inline>
                    <Text size="small" color="color.text.subtlest">{count}</Text>
                  </Inline>
                  <div style={{ height: 8, borderRadius: 4, backgroundColor: token('color.background.neutral'), overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${tasks.length > 0 ? (count / tasks.length) * 100 : 0}%`, backgroundColor: color, transition: 'width 0.3s ease' }} />
                  </div>
                </Stack>
              ))}
            </Stack>
          </Box>
        </div>

        {/* Remaining tasks table */}
        <Box padding="space.300" style={{ backgroundColor: token('elevation.surface.raised'), borderRadius: '6px', boxShadow: token('elevation.shadow.raised'), marginBottom: token('space.400') }}>
          <Stack space="space.200">
            <Inline spread="space-between" alignBlock="center">
              <Text weight="medium" color="color.text">Remaining Tasks</Text>
              <Badge appearance="default">{remaining.length}</Badge>
            </Inline>
            <DynamicTable
              head={tableHead}
              rows={tableRows}
              rowsPerPage={10}
              defaultPage={1}
              isLoading={tasksQuery.isLoading}
              emptyView={<Text size="small" color="color.text.subtlest">All tasks completed!</Text>}
            />
          </Stack>
        </Box>

        {/* Team performance */}
        <Box padding="space.300" style={{ backgroundColor: token('elevation.surface.raised'), borderRadius: '6px', boxShadow: token('elevation.shadow.raised') }}>
          <Stack space="space.200">
            <Text weight="medium" color="color.text">Team Performance</Text>
            {memberPerf.length === 0 ? (
              <Text size="small" color="color.text.subtlest">No team members found</Text>
            ) : (
              memberPerf.map(({ member, assigned, completed, rate }) => (
                <div key={member.userId} style={{ display: 'grid', gridTemplateColumns: '200px 60px 60px 120px 1fr', gap: token('space.200'), alignItems: 'center', padding: `${token('space.100')} 0`, borderBottom: `1px solid ${token('color.border')}` }}>
                  <Inline space="space.150" alignBlock="center">
                    <Avatar size="small" name={member.fullName ?? member.email} src={member.avatarUrl ?? undefined} />
                    <Text size="small" color="color.text">{member.fullName ?? member.email}</Text>
                  </Inline>
                  <div style={{ textAlign: 'center' }}><Text size="small" color="color.text.subtle">{assigned}</Text></div>
                  <div style={{ textAlign: 'center' }}><Text size="small" color="color.text.subtle">{completed}</Text></div>
                  <Text size="small" color={rate >= 0.7 ? 'color.text.success' : 'color.text.subtle'}>{Math.round(rate * 100)}%</Text>
                  <ProgressBar value={rate} appearance={rate >= 0.7 ? 'success' : 'default'} />
                </div>
              ))
            )}
            {memberPerf.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '200px 60px 60px 120px 1fr', gap: token('space.200') }}>
                <Text size="small" color="color.text.subtlest">Member</Text>
                <div style={{ textAlign: 'center' }}><Text size="small" color="color.text.subtlest">Assigned</Text></div>
                <div style={{ textAlign: 'center' }}><Text size="small" color="color.text.subtlest">Done</Text></div>
                <Text size="small" color="color.text.subtlest">Rate</Text>
                <span />
              </div>
            )}
          </Stack>
        </Box>
      </div>
    </div>
  );
}
