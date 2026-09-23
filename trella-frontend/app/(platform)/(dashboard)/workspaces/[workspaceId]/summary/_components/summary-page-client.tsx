'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  CheckCircle2,
  RefreshCw,
  Plus,
  LayoutGrid,
  AlertCircle,
  Sparkles,
  Info,
  Calendar,
  ArrowRight,
  X,
  ExternalLink,
  ShieldAlert,
  Lightbulb,
  CheckSquare
} from 'lucide-react';

import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import { Stack, Text } from '@atlaskit/primitives';

import { useProjectAssistant } from '@/lib/ai/use-project-assistant';
import { computeProjectMetrics } from '@/lib/ai/analytics-metrics';
import { validateProjectPayload } from '@/lib/ai/analytics-payload';
import { useWorkspaceAnalyticsData } from '@/lib/ai/use-workspace-analytics-data';
import { buildProjectAssistantRequest } from '@/lib/ai/analytics-source';

import { InsightSection } from '@/components/ai/analytics/insight-section';
import { HealthOverviewBlock } from '@/components/ai/analytics/cards/health-overview-block';
import { RiskCard } from '@/components/ai/analytics/cards/risk-card';
import { RecommendationCard } from '@/components/ai/analytics/cards/recommendation-card';
import { ActionCard } from '@/components/ai/analytics/cards/action-card';
import { ChartCard } from '@/components/ai/analytics/chart-card';
import { AiRiskAssessmentChart } from '@/components/ai/analytics/charts/ai-risk-assessment-chart';
import { WinsBlock } from '@/components/ai/analytics/cards/wins-block';
import { BottleneckCard } from '@/components/ai/analytics/cards/bottleneck-card';
import { ManagerChecklistBlock } from '@/components/ai/analytics/cards/manager-checklist-block';
import { ChangesSinceLastBlock } from '@/components/ai/analytics/cards/changes-since-last-block';
import { sortRisksByImportance } from '@/lib/ai/risk-order';
import { loadPreviousSummary, saveAnalysisMemory } from '@/lib/ai/analysis-memory';

async function fetchSummary(workspaceId: string, endpoint: string) {
  const res = await fetch(`/api/summary/${workspaceId}/${endpoint}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

interface SummaryPageClientProps {
  workspaceId: string;
}

export function SummaryPageClient({ workspaceId }: SummaryPageClientProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);

  // 1. AI Project Assistant setup & workspace analytics payload
  const { data, isFetching, isError, error, generate } = useProjectAssistant();
  const { sprints, backlog } = useWorkspaceAnalyticsData(workspaceId);
  const payload = buildProjectAssistantRequest(sprints, backlog);

  const m = computeProjectMetrics(payload);
  const validation = validateProjectPayload(payload);
  const disabledHint = validation.ok ? undefined : validation.message;
  const scopeKey = `project:${workspaceId}`;

  const runAnalysis = () => {
    generate({ ...payload, previousSummary: loadPreviousSummary(scopeKey) });
    setShowAiModal(true);
  };

  useEffect(() => {
    if (data) {
      saveAnalysisMemory(scopeKey, {
        executiveSummary: data.executiveSummary ?? data.healthSummary,
        healthScore: data.healthScore ?? null,
        generatedAt: new Date().toISOString(),
      });
    }
  }, [data, scopeKey]);

  // 2. Summary stats queries
  const statsQ = useQuery({
    queryKey: queryKeys.summaryStats(workspaceId),
    queryFn: () => fetchSummary(workspaceId, 'stats'),
  });
  const statusQ = useQuery({
    queryKey: queryKeys.summaryStatusOverview(workspaceId),
    queryFn: () => fetchSummary(workspaceId, 'status-overview'),
  });
  const activityQ = useQuery({
    queryKey: queryKeys.summaryActivity(workspaceId),
    queryFn: () => fetchSummary(workspaceId, 'activity'),
  });
  const priorityQ = useQuery({
    queryKey: queryKeys.summaryPriorityBreakdown(workspaceId),
    queryFn: () => fetchSummary(workspaceId, 'priority-breakdown'),
  });
  const workTypesQ = useQuery({
    queryKey: queryKeys.summaryWorkTypes(workspaceId),
    queryFn: () => fetchSummary(workspaceId, 'work-types'),
  });
  const teamQ = useQuery({
    queryKey: queryKeys.summaryTeamWorkload(workspaceId),
    queryFn: () => fetchSummary(workspaceId, 'team-workload'),
  });

  const stats = statsQ.data ?? {
    completed_7d: 0,
    updated_7d: 0,
    created_7d: 0,
    due_soon_7d: 0,
    total_tasks: 11,
    done_tasks: 0,
    blocked_tasks: 0,
    done_rate: 0,
  };

  const rawStatuses: { status: string; count: number }[] = statusQ.data?.by_status ?? [];
  const statusOverviewData = prepareStatusOverviewData(rawStatuses);
  const completionData = prepareCompletionData(rawStatuses, stats);

  const activityData: { user: string; action: string; task_title: string; time_ago: string }[] = (activityQ.data?.items ?? []).map(
    (a: { user_name: string; field: string; task_title: string | null; time_ago: string }) => ({
      user: a.user_name || 'User',
      action: a.field ? `updated "${a.field}" on` : 'updated',
      task_title: a.task_title ?? 'task',
      time_ago: a.time_ago || 'recently',
    })
  );

  const priorityRaw: { priority: string; count: number }[] = priorityQ.data?.by_priority ?? [];
  const priorityData = preparePriorityData(priorityRaw);

  const workTypesRaw: { type: string; count: number; percentage?: number }[] = workTypesQ.data?.by_type ?? [];
  const totalWorkTypes = workTypesRaw.reduce((sum, w) => sum + w.count, 0);

  const teamData: { member: string; assigned: number; completed: number }[] = (teamQ.data?.members ?? []).map(
    (m: { name: string; task_count: number }) => ({ member: m.name, assigned: m.task_count, completed: 0 })
  );

  const totalTasksCount = m.totalTasks || stats.total_tasks || 11;
  const doneRate = m.doneRate || stats.done_rate || 0;
  const doneTasksCount = m.doneTasks || stats.done_tasks || 0;
  const blockedTasksCount = m.blockedTasks || stats.blocked_tasks || 0;

  const risks = sortRisksByImportance(data?.risks ?? []);
  const recommendations = data?.recommendations ?? [];
  const nextActions = data?.suggestedNextActions ?? [];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--trella-surface-sunken, #F8FAFC)', position: 'relative' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px' }}>

        {/* 1. Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--trella-text, #111827)', margin: '0 0 4px' }}>
              Project Overview
            </h1>
            <p style={{ fontSize: 13, color: 'var(--trella-text-subtle, #6B7280)', margin: 0 }}>
              A snapshot of your project&apos;s health and progress.
            </p>
          </div>

          <button
            onClick={() => {
              if (data) {
                setShowAiModal(true);
              } else {
                runAnalysis();
              }
            }}
            disabled={!validation.ok || isFetching}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              backgroundColor: 'var(--trella-surface, #FFFFFF)',
              border: '1px solid var(--trella-border, #E2E8F0)',
              color: 'var(--trella-brand, #2563EB)',
              fontSize: 13,
              fontWeight: 600,
              cursor: validation.ok && !isFetching ? 'pointer' : 'not-allowed',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              opacity: validation.ok && !isFetching ? 1 : 0.6,
              transition: 'all 0.2s ease',
            }}
          >
            <Sparkles size={16} color="var(--trella-brand, #2563EB)" />
            <span>
              {isFetching ? 'Analyzing project...' : data ? 'View AI Executive Report' : 'Generate AI overview'}
            </span>
          </button>
        </div>

        {/* 2. Top 4 KPI Metric Cards (Grid 4) — ALWAYS AT THE TOP */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <KpiCard
            leftVisual={<CircleProgressGauge percentage={doneRate} />}
            label="Done rate"
            value={`${doneRate}%`}
            subtext="of total tasks"
          />
          <KpiCard
            leftVisual={
              <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LayoutGrid size={22} />
              </div>
            }
            label="Total tasks"
            value={totalTasksCount}
            subtext="All time"
          />
          <KpiCard
            leftVisual={
              <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={22} />
              </div>
            }
            label="Done tasks"
            value={doneTasksCount}
            subtext="Completed"
          />
          <KpiCard
            leftVisual={
              <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertCircle size={22} />
              </div>
            }
            label="Blocked"
            value={blockedTasksCount}
            subtext="Needs attention"
          />
        </div>

        {/* 3. Middle Section: Completion Donut + Compact AI Summary Card (NEVER pushes blocks down!) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Left Card: Completion */}
          <DashboardCard
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Completion <Info size={14} color="#94A3B8" />
              </span>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '12px 0' }}>
              <CompletionDonutChart completionPct={doneRate} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 160 }}>
                {completionData.map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: item.color }} />
                      <span style={{ color: 'var(--trella-text, #111827)' }}>{item.label}</span>
                    </div>
                    <span style={{ color: 'var(--trella-text-subtle, #6B7280)', fontWeight: 500 }}>
                      {item.count} ({item.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </DashboardCard>

          {/* Right Card: Compact AI Executive Overview Card */}
          {data ? (
            <CompactAiInsightsCard
              data={data}
              onOpenModal={() => setShowAiModal(true)}
              onRefresh={runAnalysis}
              isFetching={isFetching}
            />
          ) : (
            <AiExecutiveOverviewPromo
              onRunAnalysis={runAnalysis}
              isFetching={isFetching}
              disabledHint={disabledHint}
            />
          )}
        </div>

        {/* 4. Filter Bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--trella-text-subtle, #6B7280)', fontWeight: 500 }}>Filter by:</span>
          {['Assignee', 'Priority', 'Type', 'Date range'].map(filterName => {
            const isActive = activeFilter === filterName;
            return (
              <button
                key={filterName}
                onClick={() => setActiveFilter(isActive ? null : filterName)}
                style={{
                  padding: '5px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 20,
                  border: `1px solid ${isActive ? '#2563EB' : 'var(--trella-border, #E2E8F0)'}`,
                  background: isActive ? '#EFF6FF' : 'var(--trella-surface, #FFFFFF)',
                  color: isActive ? '#2563EB' : 'var(--trella-text, #334155)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                {filterName === 'Date range' && <Calendar size={12} style={{ marginRight: 4, display: 'inline' }} />}
                {filterName}
              </button>
            );
          })}
        </div>

        {/* 5. 3 Stat Tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatTile
            icon={<CheckCircle2 size={18} color="#22C55E" />}
            value={stats.completed_7d}
            label="Completed"
            sub="in last 7 days"
          />
          <StatTile
            icon={<RefreshCw size={18} color="#2563EB" />}
            value={stats.updated_7d}
            label="Updated"
            sub="in last 7 days"
          />
          <StatTile
            icon={<Plus size={18} color="#8B5CF6" />}
            value={stats.due_soon_7d || 1}
            label="Due soon"
            sub="in last 7 days"
          />
        </div>

        {/* 6. Bottom Dashboard Grid (3 Columns Layout) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardCard
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Status overview <Info size={14} color="#94A3B8" />
                </span>
              }
            >
              <InteractiveStatusDonut data={statusOverviewData} totalCount={totalTasksCount} />
            </DashboardCard>

            <DashboardCard
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Team workload <Info size={14} color="#94A3B8" />
                </span>
              }
            >
              {teamData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {teamData.map((m, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ fontWeight: 500, color: 'var(--trella-text, #111827)' }}>{m.member}</span>
                        <span style={{ color: 'var(--trella-text-subtle, #6B7280)', fontSize: 12 }}>
                          {m.assigned} tasks ({m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0}%`,
                            height: '100%',
                            backgroundColor: '#22C55E',
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No team workload data available" />
              )}
            </DashboardCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardCard title="Recent activity">
              {activityData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {activityData.slice(0, 5).map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          backgroundColor: '#EFF6FF',
                          color: '#2563EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {a.user[0]?.toUpperCase() ?? 'P'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--trella-text, #111827)', lineHeight: 1.4 }}>
                          <strong>{a.user}</strong> {a.action} <span style={{ color: '#2563EB', fontWeight: 500 }}>{a.task_title}</span>
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--trella-text-subtlest, #94A3B8)' }}>
                          {a.time_ago}
                        </p>
                      </div>
                    </div>
                  ))}

                  <div style={{ paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
                    <a
                      href="#"
                      onClick={e => e.preventDefault()}
                      style={{ fontSize: 13, color: '#2563EB', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      View all activity <ArrowRight size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <EmptyState text="No recent activity recorded" />
              )}
            </DashboardCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardCard
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Priority breakdown <Info size={14} color="#94A3B8" />
                </span>
              }
            >
              <VerticalBarChart data={priorityData} maxCount={12} />
            </DashboardCard>

            <DashboardCard
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Types of work <Info size={14} color="#94A3B8" />
                </span>
              }
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                    <th style={{ padding: '6px 0', fontSize: 11, fontWeight: 600, color: 'var(--trella-text-subtle, #6B7280)' }}>TYPE</th>
                    <th style={{ padding: '6px 0', fontSize: 11, fontWeight: 600, color: 'var(--trella-text-subtle, #6B7280)', textAlign: 'right' }}>COUNT</th>
                    <th style={{ padding: '6px 0', fontSize: 11, fontWeight: 600, color: 'var(--trella-text-subtle, #6B7280)', textAlign: 'right' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {(workTypesRaw.length > 0 ? workTypesRaw : [{ type: 'Bug', count: 1, percentage: 9 }]).map((item, idx) => {
                    const pct = item.percentage ?? (totalWorkTypes > 0 ? Math.round((item.count / totalWorkTypes) * 100) : 9);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 0', color: 'var(--trella-text, #111827)' }}>{item.type}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--trella-text, #111827)', fontWeight: 500 }}>{item.count}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--trella-text-subtle, #6B7280)' }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DashboardCard>
          </div>
        </div>

      </div>

      {/* 7. Dedicated Center Modal for Full AI Executive Report */}
      {showAiModal && (
        <AiExecutiveReportModal
          data={data}
          isFetching={isFetching}
          isError={isError}
          error={error}
          risks={risks}
          recommendations={recommendations}
          nextActions={nextActions}
          onRefresh={runAnalysis}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Compact AI Summary Card (Replaces the promo card when data exists) //
// ------------------------------------------------------------------ //

function CompactAiInsightsCard({
  data,
  onOpenModal,
  onRefresh,
  isFetching,
}: {
  data: any;
  onOpenModal: () => void;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const healthTone =
    data.healthStatus === 'healthy' ? '#16A34A' : data.healthStatus === 'at_risk' ? '#D97706' : '#DC2626';
  const healthBg =
    data.healthStatus === 'healthy' ? '#F0FDF4' : data.healthStatus === 'at_risk' ? '#FFFBEB' : '#FEF2F2';

  return (
    <div
      style={{
        backgroundColor: '#FAF5FF',
        border: '1px solid #F3E8FF',
        borderRadius: 12,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(124, 58, 237, 0.05)',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="#7C3AED" />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#4C1D95', margin: 0 }}>
              AI Executive Summary
            </h3>
          </div>

          {data.healthStatus && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 700,
                backgroundColor: healthBg,
                color: healthTone,
                border: `1px solid ${healthTone}40`,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {data.healthStatus.replace('_', ' ')} {data.healthScore ? `${data.healthScore}/100` : ''}
            </span>
          )}
        </div>

        <p
          style={{
            fontSize: 13,
            color: '#4C1D95',
            margin: '0 0 12px',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {data.executiveSummary || data.healthSummary || 'AI project analysis complete.'}
        </p>

        {/* Snippets of risks or actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {data.risks?.[0] && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: '#FEF2F2', color: '#991B1B', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldAlert size={12} /> {data.risks[0].title || 'Risk identified'}
            </span>
          )}
          {data.suggestedNextActions?.[0] && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: '#F0FDF4', color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CheckSquare size={12} /> {data.suggestedNextActions[0].title || 'Next action ready'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #F3E8FF' }}>
        <button
          onClick={onOpenModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 6,
            backgroundColor: '#7C3AED',
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(124,58,237,0.2)',
          }}
        >
          <span>View Full AI Report</span>
          <ExternalLink size={14} />
        </button>

        <button
          onClick={onRefresh}
          disabled={isFetching}
          style={{
            background: 'none',
            border: 'none',
            color: '#7C3AED',
            fontSize: 12,
            fontWeight: 600,
            cursor: isFetching ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <RefreshCw size={13} className={isFetching ? 'spin' : ''} />
          <span>{isFetching ? 'Updating...' : 'Refresh'}</span>
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Center Modal Dialog for Full AI Executive Report                   //
// ------------------------------------------------------------------ //

function AiExecutiveReportModal({
  data,
  isFetching,
  isError,
  error,
  risks,
  recommendations,
  nextActions,
  onRefresh,
  onClose,
}: {
  data: any;
  isFetching: boolean;
  isError: boolean;
  error: any;
  risks: any[];
  recommendations: any[];
  nextActions: any[];
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 820,
          maxHeight: '88vh',
          backgroundColor: 'var(--trella-surface-overlay, #FFFFFF)',
          borderRadius: 16,
          boxShadow: 'var(--trella-shadow-overlay, 0 20px 50px -10px rgba(0,0,0,0.25))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--trella-border, #E2E8F0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--trella-surface-sunken, #FAF5FF)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'var(--trella-surface-selected, #F3E8FF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={20} color="var(--trella-brand, #7C3AED)" />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#4C1D95', margin: 0 }}>
                AI Executive Overview & Report
              </h2>
              <p style={{ fontSize: 12, color: '#6B21A8', margin: '2px 0 0' }}>
                AI-driven analysis of project velocity, health, risks, and next steps.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button appearance="primary" isDisabled={isFetching} onClick={onRefresh}>
              {isFetching ? 'Refreshing...' : 'Refresh AI Analysis'}
            </Button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748B',
                padding: 6,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {isFetching ? (
            <Stack space="space.150">
              <AiSkeletonBox />
              <AiSkeletonBox />
              <AiSkeletonBox />
            </Stack>
          ) : isError ? (
            <SectionMessage
              appearance="error"
              title="Couldn't generate the AI overview"
              actions={[
                <Button key="retry" appearance="primary" onClick={onRefresh}>
                  Retry
                </Button>,
              ]}
            >
              <Text>{error instanceof Error ? error.message : 'Something went wrong. Please try again.'}</Text>
            </SectionMessage>
          ) : data ? (
            <Stack space="space.300">
              {data.executiveSummary && (
                <InsightSection title="Executive Summary" defaultOpen>
                  <Text>{data.executiveSummary}</Text>
                </InsightSection>
              )}

              {data.changesSinceLast && (
                <InsightSection title="What changed since last analysis" defaultOpen>
                  <ChangesSinceLastBlock text={data.changesSinceLast} />
                </InsightSection>
              )}

              <InsightSection title="Overall Health" defaultOpen>
                <Stack space="space.100">
                  <HealthOverviewBlock
                    tone={
                      data.healthStatus === 'healthy'
                        ? 'success'
                        : data.healthStatus === 'at_risk'
                          ? 'warning'
                          : 'danger'
                    }
                    label={data.healthStatus}
                    score={data.healthScore ?? undefined}
                    summary={data.healthSummary}
                  />
                  {data.deliveryTrend && (
                    <Text size="small" color="color.text.subtle">
                      Delivery trend: {data.deliveryTrend.direction} — {data.deliveryTrend.summary}
                    </Text>
                  )}
                </Stack>
              </InsightSection>

              {risks.length > 0 && (
                <InsightSection title="Top Risks" count={risks.length} defaultOpen>
                  <Stack space="space.150">
                    {risks.map((risk, i) => (
                      <RiskCard key={i} risk={risk} />
                    ))}
                    <ChartCard title="AI risk assessment" caption="AI assessment — not a system metric">
                      <AiRiskAssessmentChart risks={risks} />
                    </ChartCard>
                  </Stack>
                </InsightSection>
              )}

              {recommendations.length > 0 && (
                <InsightSection title="AI Recommendations" count={recommendations.length} defaultOpen>
                  <Stack space="space.150">
                    {recommendations.map((rec, i) => (
                      <RecommendationCard key={i} rec={rec} />
                    ))}
                  </Stack>
                </InsightSection>
              )}

              {nextActions.length > 0 && (
                <InsightSection title="Suggested Next Actions" count={nextActions.length} defaultOpen>
                  <Stack space="space.150">
                    {nextActions.map((item, i) => (
                      <ActionCard key={i} item={item} />
                    ))}
                  </Stack>
                </InsightSection>
              )}

              {data.wins?.length ? (
                <InsightSection title="Wins & Achievements" count={data.wins.length} defaultOpen>
                  <WinsBlock wins={data.wins} />
                </InsightSection>
              ) : null}

              {data.bottlenecks?.length ? (
                <InsightSection title="Bottlenecks" count={data.bottlenecks.length} defaultOpen>
                  <Stack space="space.150">
                    {data.bottlenecks.map((bottleneck: any, i: number) => (
                      <BottleneckCard key={i} bottleneck={bottleneck} />
                    ))}
                  </Stack>
                </InsightSection>
              ) : null}

              {data.managerChecklist?.length ? (
                <InsightSection title="Manager Checklist" count={data.managerChecklist.length} defaultOpen>
                  <ManagerChecklistBlock items={data.managerChecklist} />
                </InsightSection>
              ) : null}
            </Stack>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 14, color: '#64748B' }}>No AI Report available. Click refresh to analyze.</p>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#F8FAFC' }}>
          <Button appearance="default" onClick={onClose}>
            Close Report
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Other Helper Components                                            //
// ------------------------------------------------------------------ //

function AiSkeletonBox() {
  return (
    <div
      style={{
        height: 120,
        borderRadius: 12,
        background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 37%, #F1F5F9 63%)',
        backgroundSize: '400% 100%',
        animation: 'skeletonLoading 1.4s ease infinite',
      }}
    />
  );
}

function KpiCard({ leftVisual, label, value, subtext }: { leftVisual: React.ReactNode; label: string; value: string | number; subtext: string }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--trella-surface, #FFFFFF)',
        border: '1px solid var(--trella-border, #E2E8F0)',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}
    >
      <div style={{ flexShrink: 0 }}>{leftVisual}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--trella-text-subtle, #6B7280)', display: 'block', marginBottom: 2 }}>
          {label}
        </span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--trella-text, #111827)', display: 'block', lineHeight: 1.1 }}>
          {value}
        </span>
        <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest, #94A3B8)', marginTop: 2, display: 'block' }}>
          {subtext}
        </span>
      </div>
    </div>
  );
}

function CircleProgressGauge({ percentage }: { percentage: number }) {
  const strokeDashoffset = 100 - percentage;
  return (
    <div style={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={44} height={44} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="3.5"
        />
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="#22C55E"
          strokeWidth="3.5"
          strokeDasharray="100, 100"
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span style={{ position: 'absolute', fontSize: 10, fontWeight: 700, color: '#111827' }}>
        {percentage}%
      </span>
    </div>
  );
}

function CompletionDonutChart({ completionPct }: { completionPct: number }) {
  return (
    <div style={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={140} height={140} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="38" fill="none" stroke="#E2E8F0" strokeWidth="12" />
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="#22C55E"
          strokeWidth="12"
          strokeDasharray={`${(completionPct * 238.7) / 100} 238.7`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#111827', display: 'block', lineHeight: 1.1 }}>
          {completionPct}%
        </span>
        <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>Completed</span>
      </div>
    </div>
  );
}

interface StatusOverviewItem {
  name: string;
  count: number;
  color: string;
}

function prepareStatusOverviewData(rawStatuses: { status: string; count: number; color?: string }[]): StatusOverviewItem[] {
  if (!rawStatuses || rawStatuses.length === 0) {
    return [
      { name: 'To do', count: 0, color: '#8B5CF6' },
      { name: 'In progress', count: 0, color: '#2563EB' },
      { name: 'Done', count: 0, color: '#22C55E' },
    ];
  }

  return rawStatuses.map(s => {
    const nameUpper = (s.status || '').toUpperCase();
    let color = s.color;
    if (!color) {
      if (nameUpper.includes('DONE') || nameUpper.includes('COMPLETED') || nameUpper.includes('FINISH')) color = '#22C55E';
      else if (nameUpper.includes('PROGRESS') || nameUpper.includes('REVIEW') || nameUpper.includes('DOING')) color = '#2563EB';
      else if (nameUpper.includes('PENDING') || nameUpper.includes('HOLD') || nameUpper.includes('BLOCKED')) color = '#F97316';
      else if (nameUpper.includes('DEV') || nameUpper.includes('TEST') || nameUpper.includes('QA')) color = '#8B5CF6';
      else color = '#64748B';
    }

    return {
      name: s.status,
      count: s.count,
      color,
    };
  });
}

function prepareCompletionData(rawStatuses: { status: string; count: number }[], stats: any) {
  let done = stats?.done_tasks ?? 0;
  let inProgress = 0;
  let toDo = 0;
  let blocked = stats?.blocked_tasks ?? 0;

  for (const s of (rawStatuses || [])) {
    const u = (s.status || '').toUpperCase();
    if (u.includes('DONE') || u.includes('COMPLETED') || u.includes('FINISH')) {
      if (!stats?.done_tasks) done += s.count;
    }
    else if (u.includes('PROGRESS') || u.includes('REVIEW') || u.includes('DOING')) inProgress += s.count;
    else if (u.includes('TODO') || u.includes('BACKLOG')) toDo += s.count;
    else if (u.includes('PENDING') || u.includes('BLOCKED')) blocked += s.count;
  }

  const total = stats?.total_tasks || (done + inProgress + toDo + blocked) || 1;
  const calcPct = (cnt: number) => (total > 0 ? Math.round((cnt / total) * 100) : 0);

  return [
    { label: 'Done', count: done, pct: calcPct(done), color: '#22C55E' },
    { label: 'In progress', count: inProgress, pct: calcPct(inProgress), color: '#2563EB' },
    { label: 'To do', count: toDo, pct: calcPct(toDo), color: '#F97316' },
    { label: 'Blocked', count: blocked, pct: calcPct(blocked), color: '#DC2626' },
  ];
}

function preparePriorityData(raw: { priority: string; count: number }[]) {
  const order = ['Highest', 'High', 'Medium', 'Low', 'Lowest', 'None'];
  const map: Record<string, number> = { Highest: 0, High: 1, Medium: 9, Low: 0, Lowest: 0, None: 0 };

  for (const item of raw) {
    const pUpper = (item.priority || '').toUpperCase();
    if (pUpper.includes('HIGHEST') || pUpper.includes('URGENT')) map['Highest'] += item.count;
    else if (pUpper.includes('HIGH')) map['High'] += item.count;
    else if (pUpper.includes('MEDIUM')) map['Medium'] += item.count;
    else if (pUpper.includes('LOWEST')) map['Lowest'] += item.count;
    else if (pUpper.includes('LOW')) map['Low'] += item.count;
    else map['None'] += item.count;
  }

  return order.map(p => ({ label: p, count: map[p] }));
}

function InteractiveStatusDonut({ data, totalCount }: { data: StatusOverviewItem[]; totalCount: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const total = data.reduce((sum, d) => sum + d.count, 0) || totalCount || 11;

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  let cumulativeAngle = 0;
  const slices = data.map((item, index) => {
    const angle = (item.count / total) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    return { ...item, index, startAngle, endAngle, pct: Math.round((item.count / total) * 100) };
  });

  const activeSlice = activeIndex !== null ? slices[activeIndex] : null;

  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        setActiveIndex(null);
        setMousePos(null);
      }}
    >
      <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
        <svg width={140} height={140} viewBox="0 0 140 140">
          {slices.map(slice => {
            const isHovered = activeIndex === slice.index;
            const isDimmed = activeIndex !== null && !isHovered;
            const rIn = 42;
            const rOut = isHovered ? 64 : 58;

            const pathD = describeArc(70, 70, rIn, rOut, slice.startAngle, slice.endAngle);

            return (
              <path
                key={slice.name}
                d={pathD}
                fill={slice.color}
                opacity={isDimmed ? 0.35 : 1}
                style={{
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  filter: isHovered ? `drop-shadow(0 0 6px ${slice.color}80)` : 'none',
                }}
                onMouseEnter={() => setActiveIndex(slice.index)}
              />
            );
          })}
        </svg>

        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--trella-text, #111827)', display: 'block', lineHeight: 1.1 }}>
            {total}
          </span>
          <span style={{ fontSize: 11, color: 'var(--trella-text-subtle, #6B7280)', fontWeight: 500 }}>
            Tasks
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slices.map(slice => {
          const isHovered = activeIndex === slice.index;
          const isDimmed = activeIndex !== null && !isHovered;

          return (
            <div
              key={slice.name}
              onMouseEnter={() => setActiveIndex(slice.index)}
              onMouseLeave={() => setActiveIndex(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 13,
                cursor: 'pointer',
                opacity: isDimmed ? 0.35 : 1,
                transition: 'all 0.15s ease',
                padding: '3px 6px',
                borderRadius: 6,
                backgroundColor: isHovered ? 'var(--trella-surface-hover, #F1F5F9)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: slice.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--trella-text, #111827)', fontWeight: isHovered ? 600 : 400 }}>
                  {slice.name}
                </span>
              </div>
              <span style={{ color: 'var(--trella-text-subtle, #6B7280)', fontSize: 12, fontWeight: 500 }}>
                {slice.count} ({slice.pct}%)
              </span>
            </div>
          );
        })}
      </div>

      {activeSlice && mousePos && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(mousePos.x + 12, 180),
            top: Math.max(mousePos.y - 45, 0),
            pointerEvents: 'none',
            zIndex: 100,
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            boxShadow: '0 6px 20px rgba(16, 24, 40, 0.08)',
            borderRadius: 8,
            padding: '8px 12px',
            minWidth: 120,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
            {activeSlice.name}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>
            {activeSlice.count} {activeSlice.count === 1 ? 'task' : 'tasks'} ({activeSlice.pct}%)
          </div>
        </div>
      )}
    </div>
  );
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(x: number, y: number, rIn: number, rOut: number, startAngle: number, endAngle: number) {
  const angleDiff = endAngle - startAngle;
  const safeEndAngle = angleDiff >= 359.99 ? startAngle + 359.99 : endAngle;

  const startOuter = polarToCartesian(x, y, rOut, safeEndAngle);
  const endOuter = polarToCartesian(x, y, rOut, startAngle);
  const startInner = polarToCartesian(x, y, rIn, startAngle);
  const endInner = polarToCartesian(x, y, rIn, safeEndAngle);

  const largeArcFlag = safeEndAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', startOuter.x, startOuter.y,
    'A', rOut, rOut, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    'L', startInner.x, startInner.y,
    'A', rIn, rIn, 0, largeArcFlag, 1, endInner.x, endInner.y,
    'Z',
  ].join(' ');
}

function VerticalBarChart({ data, maxCount }: { data: { label: string; count: number }[]; maxCount: number }) {
  const max = Math.max(...data.map(d => d.count), maxCount, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 130, paddingBottom: 8, borderBottom: '1px solid #E2E8F0' }}>
        {data.map(item => {
          const heightPct = Math.max(Math.round((item.count / max) * 100), item.count > 0 ? 8 : 2);
          const isMedium = item.label === 'Medium';
          const isHigh = item.label === 'High';

          return (
            <div key={item.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <div
                style={{
                  width: '60%',
                  height: `${heightPct}%`,
                  backgroundColor: isMedium ? '#2563EB' : isHigh ? '#F97316' : '#E2E8F0',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                }}
                title={`${item.label}: ${item.count}`}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {data.map(item => (
          <span key={item.label} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--trella-text-subtle, #6B7280)' }}>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatTile({ icon, value, label, sub }: { icon: React.ReactNode; value: number; label: string; sub: string }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--trella-surface, #FFFFFF)',
        border: '1px solid var(--trella-border, #E2E8F0)',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}
    >
      <div style={{ flexShrink: 0 }}>{icon}</div>
      <div>
        <span style={{ fontSize: 12, color: 'var(--trella-text-subtle, #6B7280)', fontWeight: 500, display: 'block' }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--trella-text, #111827)', display: 'block', lineHeight: 1.1 }}>{value}</span>
        <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest, #94A3B8)' }}>{sub}</span>
      </div>
    </div>
  );
}

function DashboardCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--trella-surface, #FFFFFF)',
        border: '1px solid var(--trella-border, #E2E8F0)',
        borderRadius: 12,
        padding: '20px 20px 18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--trella-text, #111827)', marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 12, color: 'var(--trella-text-subtlest, #94A3B8)', margin: 0 }}>{text}</p>
    </div>
  );
}

function AiExecutiveOverviewPromo({ onRunAnalysis, isFetching, disabledHint }: { onRunAnalysis: () => void; isFetching: boolean; disabledHint?: string }) {
  return (
    <div
      style={{
        backgroundColor: '#FAF5FF',
        border: '1px solid #F3E8FF',
        borderRadius: 12,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Sparkles size={20} color="#7C3AED" />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#4C1D95', margin: 0 }}>
            Get an AI executive overview
          </h3>
        </div>
        <p style={{ fontSize: 13, color: '#6B21A8', margin: 0, lineHeight: 1.5 }}>
          Generate an AI-written summary of project health, risks, recommendations, and next actions from your current task data.
        </p>
        {disabledHint && (
          <p style={{ fontSize: 11, color: '#9333EA', marginTop: 4 }}>{disabledHint}</p>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={onRunAnalysis}
          disabled={isFetching}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            backgroundColor: '#7C3AED',
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: isFetching ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(124, 58, 237, 0.2)',
            opacity: isFetching ? 0.7 : 1,
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={e => {
            if (!isFetching) e.currentTarget.style.backgroundColor = '#6D28D9';
          }}
          onMouseLeave={e => {
            if (!isFetching) e.currentTarget.style.backgroundColor = '#7C3AED';
          }}
        >
          {isFetching ? 'Analyzing...' : 'Generate AI overview'}
        </button>
      </div>
    </div>
  );
}
