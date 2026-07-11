'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { token } from '@atlaskit/tokens';
import { PlansService, CustomStatusesService, type CustomStatusPublic, type TaskPublic } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { usePlanStaging } from '../../_hooks/use-plan-staging';

// ADS Design Icons
import CalendarIcon from '@atlaskit/icon/core/calendar';
import PersonAvatarIcon from '@atlaskit/icon/core/person-avatar';
import WarningIcon from '@atlaskit/icon/core/warning';
import LinkIcon from '@atlaskit/icon/core/link';
import InformationCircleIcon from '@atlaskit/icon/core/information-circle';

interface PlanSummaryClientProps {
  planId: string;
  workspaceId: string;
}

const getStatusColor = (status: CustomStatusPublic | undefined) => {
  if (status?.color) return status.color;
  switch (status?.canonicalStatus) {
    case 'TODO':
      return token('color.background.neutral.bold');
    case 'IN_PROGRESS':
      return token('color.background.brand.bold');
    case 'DONE':
      return token('color.background.success.bold');
    default:
      return token('color.background.brand.bold');
  }
};

export function PlanSummaryClient({ planId, workspaceId }: PlanSummaryClientProps) {
  const [hoveredStatusId, setHoveredStatusId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('STORY');

  const { getEffectiveTask } = usePlanStaging();

  const epicsQuery = useQuery({
    queryKey: queryKeys.planEpics(planId),
    queryFn: () => PlansService.Plans_plansListEpicsForPlan({ planId }),
  });
  // Overlay staged edits so summary metrics reflect unsaved plan changes.
  const epics = useMemo(
    () => (epicsQuery.data ?? []).map(e => getEffectiveTask(e as unknown as TaskPublic)),
    [epicsQuery.data, getEffectiveTask]
  );

  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId }),
  });
  const statuses = useMemo(() => customStatusesQuery.data ?? [], [customStatusesQuery.data]);

  // Compute dynamic date range from tasks
  const dateRangeStr = useMemo(() => {
    const dates = epics.flatMap(e => [e.startDate, e.dueDate].filter(Boolean).map(d => new Date(d as string)));
    if (dates.length === 0) return 'No date range set';
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    const formatD = (d: Date) => {
      const day = String(d.getDate()).padStart(2, '0');
      const month = d.toLocaleString('en', { month: 'short' });
      const year = String(d.getFullYear()).slice(-2);
      return `${day}/${month}/${year}`;
    };
    return `${formatD(min)} - ${formatD(max)}`;
  }, [epics]);

  // Calculations for stat tiles
  const unassignedCount = useMemo(() => epics.filter(e => !e.assigneeId).length, [epics]);
  const highPriorityCount = useMemo(() => epics.filter(e => e.priority === 'HIGH' || e.priority === 'URGENT').length, [epics]);
  const overdueCount = useMemo(() => {
    const now = new Date();
    return epics.filter(e => {
      if (!e.dueDate) return false;
      const due = new Date(e.dueDate);
      const statusObj = statuses.find(s => s.id === e.customStatusId);
      const canonicalStatus = statusObj?.canonicalStatus || 'TODO';
      return due < now && canonicalStatus !== 'DONE';
    }).length;
  }, [epics, statuses]);

  // Filter tasks based on selected dropdown type
  const filteredTasks = useMemo(() => {
    if (filterType === 'ALL') return epics;
    return epics.filter(e => e.type === filterType);
  }, [epics, filterType]);

  // Dynamic grouping based on workspace custom statuses
  const statusStats = useMemo(() => {
    const statsMap: Record<string, number> = {};
    statuses.forEach(s => {
      statsMap[s.id] = 0;
    });

    const defaultTodoStatus = statuses.find(s => s.canonicalStatus === 'TODO');

    for (const epic of filteredTasks) {
      if (epic.customStatusId && statsMap[epic.customStatusId] !== undefined) {
        statsMap[epic.customStatusId]++;
      } else if (defaultTodoStatus) {
        statsMap[defaultTodoStatus.id]++;
      }
    }

    return statsMap;
  }, [filteredTasks, statuses]);

  // Donut chart calculations
  const totalFiltered = filteredTasks.length;
  const radius = 42;
  const circ = 2 * Math.PI * radius; // 263.89

  const slices = useMemo(() => {
    let accumulated = 0;
    return statuses.map(status => {
      const count = statusStats[status.id] || 0;
      const percent = totalFiltered > 0 ? count / totalFiltered : 0;
      const strokeDasharray = `${percent * circ} ${circ}`;
      const strokeDashoffset = circ - (accumulated * circ);
      accumulated += percent;

      return {
        id: status.id,
        name: status.name,
        color: getStatusColor(status),
        count,
        percent: Math.round(percent * 100),
        strokeDasharray,
        strokeDashoffset,
        canonicalStatus: status.canonicalStatus,
      };
    });
  }, [statuses, statusStats, totalFiltered]);

  // Determine active slice for chart center display
  const activeSlice = useMemo(() => {
    if (hoveredStatusId) {
      return slices.find(s => s.id === hoveredStatusId);
    }
    // Default to the first completed status (DONE) or first item
    const doneSlice = slices.find(s => s.canonicalStatus === 'DONE');
    return doneSlice || slices[0];
  }, [slices, hoveredStatusId]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--ds-surface)', color: 'var(--ds-text)', padding: '24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        
        {/* Date range header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ds-surface-sunken)', border: '1px solid var(--ds-border)', borderRadius: 4, padding: '6px 12px', fontSize: 13, fontWeight: 500, color: 'var(--ds-text)' }}>
            <CalendarIcon label="Calendar" size="small" />
            <span>{dateRangeStr}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ds-text-subtle)' }}>
            <span>Date last saved Jul 04, 2026</span>
            <span style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: 'var(--ds-text-subtle)' }}>
              <InformationCircleIcon label="Info" size="small" />
            </span>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatTile
            title={`${unassignedCount} unassigned work items`}
            icon={
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: token('color.background.brand.subtlest'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-brand)' }}>
                <PersonAvatarIcon label="Unassigned" size="small" />
              </div>
            }
          />
          <StatTile
            title={`${highPriorityCount} highest priority work items`}
            icon={
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: token('color.background.neutral'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-subtle)' }}>
                <WarningIcon label="Priority" size="small" />
              </div>
            }
          />
          <StatTile
            title={`${overdueCount} overdue work item${overdueCount !== 1 ? 's' : ''}`}
            icon={
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: token('color.background.danger'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-danger)' }}>
                <CalendarIcon label="Overdue" size="small" />
              </div>
            }
            titleColor={overdueCount > 0 ? 'var(--ds-text-danger)' : undefined}
          />
          <StatTile
            title="0 blocked work items"
            icon={
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: token('color.background.neutral'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-subtle)' }}>
                <LinkIcon label="Blocked" size="small" />
              </div>
            }
          />
        </div>

        {/* Status Overview Card */}
        <div style={{ background: 'var(--ds-surface-raised)', border: '1px solid var(--ds-border)', borderRadius: 6, padding: '24px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ds-text)', margin: 0 }}>Status Overview</h2>
            <div style={{ position: 'relative' }}>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                style={{
                  background: 'var(--ds-surface-sunken)',
                  border: '1px solid var(--ds-border)',
                  borderRadius: 4,
                  padding: '6px 12px 6px 8px',
                  color: 'var(--ds-text)',
                  fontSize: 13,
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                }}
              >
                <option value="STORY">Story</option>
                <option value="EPIC">Epic</option>
                <option value="TASK">Task</option>
                <option value="BUG">Bug</option>
                <option value="ALL">All Types</option>
              </select>
              <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10, color: 'var(--ds-text-subtle)' }}>▼</div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--ds-text-subtle)', margin: '0 0 32px' }}>
            Select one of the options below to view work items with the To do, In Progress, or Done status category on your timeline.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 80 }}>
            {/* Chart Area */}
            <div style={{ position: 'relative', width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="160" height="160" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background track circle */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke="var(--ds-border)"
                  strokeWidth="8"
                />
                
                {/* Slice circles */}
                {slices.map(slice => {
                  const isActive = activeSlice?.id === slice.id;
                  return (
                    <circle
                      key={slice.id}
                      cx="50"
                      cy="50"
                      r={radius}
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth={isActive ? '11' : '8'}
                      strokeDasharray={slice.strokeDasharray}
                      strokeDashoffset={slice.strokeDashoffset}
                      style={{ transition: 'stroke-width 0.2s ease, stroke 0.2s ease' }}
                    />
                  );
                })}
              </svg>

              {/* Center text overlay */}
              <div style={{
                position: 'absolute',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ds-text)' }}>
                  {activeSlice ? `${activeSlice.percent}%` : '0%'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ds-text-subtle)', marginTop: 2 }}>
                  {activeSlice ? activeSlice.name : 'Done'}
                </span>
              </div>
            </div>

            {/* List details */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
              {slices.map(slice => {
                const isHovered = hoveredStatusId === slice.id;
                return (
                  <div
                    key={slice.id}
                    onMouseEnter={() => setHoveredStatusId(slice.id)}
                    onMouseLeave={() => setHoveredStatusId(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 4,
                      background: isHovered ? 'var(--ds-border)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: slice.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: isHovered ? 'var(--ds-text)' : 'var(--ds-text)' }}>{slice.name}</span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--ds-text-subtle)', fontWeight: 600 }}>
                      {slice.count} work item{slice.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}

              <div style={{ height: 1, background: 'var(--ds-border)', margin: '6px 0' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text)' }}>Total</span>
                <span style={{ fontSize: 13, color: 'var(--ds-text-subtle)', fontWeight: 600 }}>
                  {totalFiltered} work item{totalFiltered !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

interface StatTileProps {
  title: string;
  icon: React.ReactNode;
  titleColor?: string;
}

function StatTile({ title, icon, titleColor }: StatTileProps) {
  return (
    <div style={{
      background: 'var(--ds-surface-raised)',
      border: '1px solid var(--ds-border)',
      borderRadius: 6,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 600, color: titleColor ?? 'var(--ds-text)', lineHeight: '1.4' }}>{title}</span>
    </div>
  );
}
