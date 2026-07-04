'use client';

import React, { useState } from 'react';
import Select from '@atlaskit/select';
import { useQuery } from '@tanstack/react-query';
import { SprintsService } from '@/lib/client';
import type { SprintWithTasks } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import CrossIcon from '@atlaskit/icon/core/cross';

interface InsightsPanelProps {
  projectId: string;
  sprints: SprintWithTasks[];
  onClose: () => void;
}

const WORK_TYPE_COLORS: Record<string, string> = {
  STORY: '#64BA3B',
  BUG: '#FF5630',
  TASK: '#0052CC',
  SUBTASK: 'var(--trella-text-subtlest)',
};

export function InsightsPanel({ projectId, sprints, onClose }: InsightsPanelProps) {
  const sprintOptions = sprints.map(s => ({ label: s.name, value: s.id }));
  const [selectedSprint, setSelectedSprint] = useState<{ label: string; value: string } | null>(
    sprintOptions[0] ?? null
  );

  const insightsQuery = useQuery({
    queryKey: queryKeys.sprintInsights(projectId, selectedSprint?.value ?? ''),
    queryFn: () =>
      SprintsService.Sprints_sprintsGetSprintInsights({
        projectId,
        sprintId: selectedSprint!.value,
      }),
    enabled: !!selectedSprint,
  });

  const insights = insightsQuery.data;
  const commitment = insights?.commitment as { total?: number; completed?: number; totalPoints?: number; completedPoints?: number } | undefined;
  const workTypes = insights?.workTypes ?? {} as Record<string, number>;
  const totalWorkTypes = Object.values(workTypes).reduce((a: number, b: unknown) => a + (b as number), 0);

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 320,
        backgroundColor: 'var(--trella-surface)',
        borderLeft: `1px solid ${'var(--trella-border)'}`,
        boxShadow: '0 4px 16px rgba(9,30,66,0.18)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${'var(--trella-border)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--trella-text)' }}>Backlog Insights</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--trella-text-subtlest)',
            padding: 4,
            borderRadius: 3,
          }}
        >
          <CrossIcon label="close" size="small" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Sprint selector */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--trella-text-subtlest)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Sprint
          </label>
          <Select
            options={sprintOptions}
            value={selectedSprint}
            onChange={opt => setSelectedSprint(opt as { label: string; value: string } | null)}
            placeholder="Select sprint..."
            menuPlacement="auto"
          />
        </div>

        {insightsQuery.isLoading && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <span style={{ fontSize: 12, color: 'var(--trella-text-subtlest)' }}>Loading insights...</span>
          </div>
        )}

        {insightsQuery.isError && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <span style={{ fontSize: 12, color: '#FF5630' }}>Failed to load insights.</span>
          </div>
        )}

        {insights && (
          <>
            {/* Sprint commitment */}
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--trella-text)', display: 'block', marginBottom: 10 }}>
                Sprint commitment
              </span>
              {commitment && (commitment.totalPoints ?? commitment.total ?? 0) > 0 ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--trella-text-subtlest)' }}>
                      {commitment.completedPoints ?? commitment.completed ?? 0} / {commitment.totalPoints ?? commitment.total ?? 0}
                      {commitment.totalPoints ? ' pts' : ' items'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--trella-text-subtlest)' }}>
                      {(commitment.total ?? 0) > 0
                        ? Math.round(((commitment.completed ?? 0) / (commitment.total ?? 1)) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, backgroundColor: 'var(--trella-surface-sunken)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 4,
                        backgroundColor: '#579DFF',
                        width: `${(commitment.total ?? 0) > 0 ? Math.round(((commitment.completed ?? 0) / (commitment.total ?? 1)) * 100) : 0}%`,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', margin: 0, fontStyle: 'italic' }}>
                  No story point estimates found. Add estimates to track sprint commitment.
                </p>
              )}
            </div>

            {/* Work type breakdown */}
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--trella-text)', display: 'block', marginBottom: 10 }}>
                Work type breakdown
              </span>
              {totalWorkTypes === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', margin: 0, fontStyle: 'italic' }}>
                  No work items in this sprint.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(workTypes)
                    .filter(([, v]) => (v as number) > 0)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([type, count]) => {
                      const numCount = count as number;
                      const pct = (totalWorkTypes as number) > 0 ? Math.round((numCount / (totalWorkTypes as number)) * 100) : 0;
                      const color = WORK_TYPE_COLORS[type.toUpperCase()] ?? '#579DFF';
                      return (
                        <div key={type}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: 'var(--trella-text)', textTransform: 'capitalize' }}>
                              {type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--trella-text-subtlest)' }}>{numCount}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, backgroundColor: 'var(--trella-surface-sunken)', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                borderRadius: 3,
                                backgroundColor: color,
                                width: `${pct}%`,
                                transition: 'width 0.3s ease',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
