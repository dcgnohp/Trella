'use client';

import React, { useState } from 'react';
import { Box, Stack, Inline, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import PageHeader from '@atlaskit/page-header';
import { useQuery } from '@tanstack/react-query';
import { BoardsService, ColumnsService } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';

import { SprintSection } from './sprint-section';
import { BacklogSection } from './backlog-section';

interface BacklogPageClientProps {
  workspaceId: string;
}

// ponytail: mock sprint list — replace when GET /sprints endpoint exists
function useMockSprints(tasks: any[]) {
  const mid = Math.ceil(tasks.length / 2);
  return [
    {
      id: 'sprint-1',
      name: 'Sprint 1',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active' as const,
      tasks: tasks.slice(0, mid),
    },
  ];
}

export function BacklogPageClient({ workspaceId }: BacklogPageClientProps) {
  const [search, setSearch] = useState('');

  // Load all boards then all tasks from first board
  // ponytail: using existing boards endpoint since no backlog endpoint yet
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

  const allTasks = tasksQuery.data ?? [];
  const filtered = search
    ? allTasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : allTasks;

  const sprints = useMockSprints(filtered);
  const sprintTaskIds = new Set(sprints.flatMap(s => s.tasks.map(t => t.id)));
  const backlogTasks = filtered.filter(t => !sprintTaskIds.has(t.id));

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: `${token('space.400')} ${token('space.500')}` }}>
        <PageHeader>Backlog</PageHeader>

        {/* Toolbar */}
        <div style={{ marginBottom: token('space.400'), display: 'flex', gap: token('space.200'), alignItems: 'center' }}>
          <div style={{ width: 240 }}>
            <Textfield
              value={search}
              onChange={e => setSearch((e.target as HTMLInputElement).value)}
              placeholder="Search backlog"
              aria-label="Search backlog"
            />
          </div>
          <Button appearance="subtle">Filter</Button>
        </div>

        <Stack space="space.300">
          {sprints.map(sprint => (
            <SprintSection
              key={sprint.id}
              sprint={sprint}
              onCompleteSprintClick={() => {/* TODO: open complete sprint modal */}}
            />
          ))}
          <BacklogSection tasks={backlogTasks} />
        </Stack>
      </div>
    </div>
  );
}
