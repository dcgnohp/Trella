'use client';

import React, { useMemo, useState } from 'react';
import { token } from '@atlaskit/tokens';
import { Text, Inline, Stack } from '@atlaskit/primitives';
import Button from '@atlaskit/button/new';
import ButtonGroup from '@atlaskit/button/button-group';
import Tooltip from '@atlaskit/tooltip';
import PageHeader from '@atlaskit/page-header';
import { useQuery } from '@tanstack/react-query';
import { BoardsService } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';

type ViewMode = 'Weeks' | 'Months' | 'Quarters';

interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tasks: { id: string; title: string; dueDate?: string | null }[];
}

// ponytail: derive column widths from view mode
const VIEW_CONFIG = {
  Weeks: { colWidth: 120, unit: 'week' },
  Months: { colWidth: 160, unit: 'month' },
  Quarters: { colWidth: 240, unit: 'quarter' },
} as const;

function getMonthRange(startDate: Date, endDate: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cur <= end) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

interface TimelineChartProps {
  sprints: Sprint[];
  viewMode: ViewMode;
}

function TimelineChart({ sprints, viewMode }: TimelineChartProps) {
  const today = new Date();
  const colWidth = VIEW_CONFIG[viewMode].colWidth;

  // Compute date range covering all sprints
  const allDates = sprints.flatMap(s => [new Date(s.startDate), new Date(s.endDate)]);
  const rangeStart = allDates.length > 0
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const rangeEnd = allDates.length > 0
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth() + 3, 0);

  // Add buffer
  rangeStart.setMonth(rangeStart.getMonth() - 1);
  rangeEnd.setMonth(rangeEnd.getMonth() + 1);

  const months = getMonthRange(rangeStart, rangeEnd);
  const totalDays = daysBetween(rangeStart, rangeEnd) || 1;
  const pxPerDay = (months.length * colWidth) / totalDays;

  const todayLeft = daysBetween(rangeStart, today) * pxPerDay;
  const totalWidth = months.length * colWidth;

  const getBarStyle = (startDate: string, endDate: string, isOverdue?: boolean) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const left = daysBetween(rangeStart, start) * pxPerDay;
    const width = Math.max(daysBetween(start, end) * pxPerDay, 20);
    return {
      left,
      width,
      backgroundColor: isOverdue
        ? token('color.background.danger.bold')
        : token('color.background.brand.bold'),
    };
  };

  const LEFT_PANEL = 280;

  return (
    <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
      {/* Left panel */}
      <div style={{ width: LEFT_PANEL, flexShrink: 0, borderRight: `1px solid ${token('color.border')}` }}>
        <div style={{ height: 40, borderBottom: `1px solid ${token('color.border')}`, display: 'flex', alignItems: 'center', padding: `0 ${token('space.300')}` }}>
          <Text size="small" weight="bold" color="color.text.subtle">WORK</Text>
        </div>
        {sprints.map(sprint => (
          <div key={sprint.id}>
            <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: `0 ${token('space.300')}`, borderBottom: `1px solid ${token('color.border')}`, backgroundColor: token('elevation.surface.sunken') }}>
              <Text size="small" weight="medium" color="color.text">{sprint.name}</Text>
            </div>
            {sprint.tasks.map(task => (
              <div key={task.id} style={{ height: 36, display: 'flex', alignItems: 'center', padding: `0 ${token('space.400')}`, borderBottom: `1px solid ${token('color.border')}` }}>
                <Text size="small" color="color.text.subtle">{task.title}</Text>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Right scrollable area */}
      <div style={{ flex: 1, overflowX: 'auto', position: 'relative' }}>
        {/* Month headers */}
        <div style={{ display: 'flex', height: 40, borderBottom: `1px solid ${token('color.border')}`, position: 'sticky', top: 0, backgroundColor: token('elevation.surface'), zIndex: 2, width: totalWidth }}>
          {months.map((m, i) => (
            <div key={i} style={{ width: colWidth, flexShrink: 0, display: 'flex', alignItems: 'center', padding: `0 ${token('space.200')}`, borderRight: `1px solid ${token('color.border')}` }}>
              <Text size="small" weight="medium" color="color.text.subtle">
                {m.toLocaleDateString('en', { month: 'short', year: 'numeric' })}
              </Text>
            </div>
          ))}
        </div>

        {/* Today line */}
        {todayLeft >= 0 && todayLeft <= totalWidth && (
          <div style={{
            position: 'absolute',
            left: todayLeft,
            top: 40,
            bottom: 0,
            width: 2,
            backgroundColor: token('color.border.brand'),
            zIndex: 3,
            pointerEvents: 'none',
          }}>
            <div style={{ position: 'absolute', top: 4, left: -18, fontSize: 10, fontWeight: 600, color: token('color.text.selected'), backgroundColor: token('color.background.selected'), padding: '1px 4px', borderRadius: 2 }}>
              Today
            </div>
          </div>
        )}

        {/* Sprint + task bars */}
        <div style={{ position: 'relative', width: totalWidth }}>
          {sprints.map(sprint => {
            const sprintBar = getBarStyle(sprint.startDate, sprint.endDate);
            const isOverdue = new Date(sprint.endDate) < today;

            return (
              <div key={sprint.id}>
                {/* Sprint row */}
                <div style={{ height: 40, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${token('color.border')}`, position: 'relative', backgroundColor: token('elevation.surface.sunken') }}>
                  <Tooltip content={`${sprint.name}: ${sprint.startDate.slice(0, 10)} → ${sprint.endDate.slice(0, 10)}`}>
                    {(tooltipProps) => (
                      <div {...tooltipProps} style={{
                        position: 'absolute',
                        ...sprintBar,
                        height: 20,
                        borderRadius: '3px',
                        display: 'flex', alignItems: 'center', paddingInline: token('space.100'),
                        cursor: 'pointer',
                      }}>
                        <Text size="small" color="color.text.inverse">{sprint.name}</Text>
                      </div>
                    )}
                  </Tooltip>
                </div>

                {/* Task rows */}
                {sprint.tasks.map(task => {
                  if (!task.dueDate) {
                    return (
                      <div key={task.id} style={{ height: 36, borderBottom: `1px solid ${token('color.border')}` }} />
                    );
                  }
                  const taskBarStart = sprint.startDate;
                  const taskBarStyle = getBarStyle(taskBarStart, task.dueDate, new Date(task.dueDate) < today);
                  return (
                    <div key={task.id} style={{ height: 36, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${token('color.border')}`, position: 'relative' }}>
                      <div style={{
                        position: 'absolute',
                        ...taskBarStyle,
                        height: 16,
                        borderRadius: '3px',
                        opacity: 0.75,
                      }} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TimelinePageClientProps {
  workspaceId: string;
}

export function TimelinePageClient({ workspaceId }: TimelinePageClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('Months');

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

  // ponytail: mock sprint from tasks since no sprint endpoint yet
  const mockSprints = useMemo((): Sprint[] => {
    const tasks = tasksQuery.data ?? [];
    const today = new Date();
    return [{
      id: 'sprint-1',
      name: 'Sprint 1',
      startDate: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
      endDate: new Date(today.getFullYear(), today.getMonth() + 1, 14).toISOString(),
      tasks: tasks.slice(0, 6).map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
    }];
  }, [tasksQuery.data]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: `${token('space.300')} ${token('space.500')}`, flexShrink: 0 }}>
        <PageHeader
          actions={
            <ButtonGroup label="View mode">
              {(['Weeks', 'Months', 'Quarters'] as ViewMode[]).map(mode => (
                <Button
                  key={mode}
                  appearance={viewMode === mode ? 'primary' : 'default'}
                  onClick={() => setViewMode(mode)}
                  spacing="compact"
                >
                  {mode}
                </Button>
              ))}
            </ButtonGroup>
          }
        >
          Timeline
        </PageHeader>
      </div>
      <TimelineChart sprints={mockSprints} viewMode={viewMode} />
    </div>
  );
}
