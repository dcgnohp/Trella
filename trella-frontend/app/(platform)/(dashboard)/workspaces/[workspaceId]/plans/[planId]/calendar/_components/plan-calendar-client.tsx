'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import { token } from '@atlaskit/tokens';
import { Text } from '@atlaskit/primitives';
import Button from '@atlaskit/button/new';
import PageHeader from '@atlaskit/page-header';
import ButtonGroup from '@atlaskit/button/button-group';
import ChevronLeftIcon from '@atlaskit/icon/core/chevron-left';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import Lozenge from '@atlaskit/lozenge';
import { PlansService } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';

interface PlanCalendarClientProps {
  planId: string;
}

export function PlanCalendarClient({ planId }: PlanCalendarClientProps) {
  const [month, setMonth] = useState(() => new Date());

  const epicsQuery = useQuery({
    queryKey: queryKeys.planEpics(planId),
    queryFn: () => PlansService.Plans_plansListEpicsForPlan({ planId }),
  });
  const epics = epicsQuery.data ?? [];

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    return eachDayOfInterval({ start, end });
  }, [month]);

  // Pad to align first day of month to its weekday column (Sun-first grid).
  const leadingBlanks = days.length > 0 ? days[0].getDay() : 0;

  const epicsByDay = (day: Date) =>
    epics.filter(e => e.dueDate && isSameDay(new Date(e.dueDate), day));

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: `${token('space.300')} ${token('space.500')}` }}>
        <PageHeader
          actions={
            <ButtonGroup label="Month navigation">
              <Button appearance="subtle" iconBefore={ChevronLeftIcon} onClick={() => setMonth(m => subMonths(m, 1))}>
                Prev
              </Button>
              <Button appearance="subtle" iconAfter={ChevronRightIcon} onClick={() => setMonth(m => addMonths(m, 1))}>
                Next
              </Button>
            </ButtonGroup>
          }
        >
          {format(month, 'MMMM yyyy')}
        </PageHeader>
      </div>

      <div style={{ padding: `0 ${token('space.500')} ${token('space.500')}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, backgroundColor: token('color.border') }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ backgroundColor: token('elevation.surface'), padding: '6px 8px' }}>
              <Text size="small" weight="bold" color="color.text.subtle">{d}</Text>
            </div>
          ))}

          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} style={{ backgroundColor: token('elevation.surface.sunken'), minHeight: 96 }} />
          ))}

          {days.map(day => {
            const dayEpics = epicsByDay(day);
            return (
              <div
                key={day.toISOString()}
                style={{
                  backgroundColor: token('elevation.surface'),
                  minHeight: 96,
                  padding: 6,
                  opacity: isSameMonth(day, month) ? 1 : 0.5,
                }}
              >
                <Text size="small" color="color.text.subtle">{format(day, 'd')}</Text>
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dayEpics.map(epic => (
                    <div key={epic.id} title={epic.title}>
                      <Lozenge appearance="default">{epic.title}</Lozenge>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
