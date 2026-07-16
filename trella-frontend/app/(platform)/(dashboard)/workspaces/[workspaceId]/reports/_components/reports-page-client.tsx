"use client";

import React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";

import Button from "@atlaskit/button/new";
import SectionMessage from "@atlaskit/section-message";
import { Box, Inline, Stack, Text } from "@atlaskit/primitives";

import { useSprintAnalysis } from "@/lib/ai/use-sprint-analysis";
import { computeSprintMetrics } from "@/lib/ai/analytics-metrics";
import { validateSprintPayload } from "@/lib/ai/analytics-payload";
import type { SprintAnalysisRequest } from "@/lib/client";

import { AnalyticsDashboardShell } from "@/components/ai/analytics/analytics-dashboard-shell";
import { MetricStrip } from "@/components/ai/analytics/metric-strip";
import { MetricCard } from "@/components/ai/analytics/metric-card";
import { ChartCard } from "@/components/ai/analytics/chart-card";
import { InsightSection } from "@/components/ai/analytics/insight-section";
import { ExecutiveSummaryBlock } from "@/components/ai/analytics/cards/executive-summary-block";
import { RiskCard } from "@/components/ai/analytics/cards/risk-card";
import { BlockerCard } from "@/components/ai/analytics/cards/blocker-card";
import { RecommendationCard } from "@/components/ai/analytics/cards/recommendation-card";
import { ActionCard } from "@/components/ai/analytics/cards/action-card";
import { TeamPerformanceBlock } from "@/components/ai/analytics/cards/team-performance-block";
import { ExtensibleSlot } from "@/components/ai/primitives/extensible-slot";
import { SprintCompletionDonut } from "@/components/ai/analytics/charts/sprint-completion-donut";
import { PlannedVsCompletedBar } from "@/components/ai/analytics/charts/planned-vs-completed-bar";
import { VelocityTrendChart } from "@/components/ai/analytics/charts/velocity-trend-chart";
import { AiRiskAssessmentChart } from "@/components/ai/analytics/charts/ai-risk-assessment-chart";

interface SprintVelocityData {
  sprints: Array<{
    sprintId: string;
    sprintName: string;
    startDate: string | null;
    endDate: string | null;
    committed: number;
    completed: number;
    taskCount: number;
  }>;
}

interface CompletionTrendData {
  sprints: Array<{
    sprintName: string;
    status: string;
    created: number;
    completed: number;
  }>;
}

async function fetchReport(workspaceId: string, endpoint: string) {
  const res = await fetch(`/api/reports/${workspaceId}/${endpoint}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

const STAT: React.CSSProperties = {
  background: "var(--trella-surface)",
  border: "1px solid var(--trella-border)",
  borderRadius: 8,
  padding: "16px 20px",
  minWidth: 140,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "var(--trella-text)" }}>{title}</h2>
      {children}
    </div>
  );
}

type VelocitySprint = SprintVelocityData["sprints"][number];

/** Primary action for the AI dashboard: generates or re-analyzes the sprint. */
function GenerateButton({
  payload,
  generate,
  hasData,
  isFetching,
}: {
  payload: SprintAnalysisRequest;
  generate: (p: SprintAnalysisRequest) => void;
  hasData: boolean;
  isFetching: boolean;
}) {
  const validation = validateSprintPayload(payload);
  const blocked = validation.ok === false;
  return (
    <Stack space="space.050" alignInline="end">
      <Button
        appearance="primary"
        isDisabled={blocked || isFetching}
        isLoading={isFetching}
        onClick={() => generate(payload)}
      >
        {hasData ? "Re-analyze" : "Generate AI analysis"}
      </Button>
      {blocked ? (
        <Text size="small" color="color.text.subtlest">
          {validation.message}
        </Text>
      ) : null}
    </Stack>
  );
}

/** Simple muted placeholder box used while the AI analysis is loading. */
function SkeletonBlock({ height = 72 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: 8,
        background: "var(--trella-surface-sunken, rgba(9,30,66,0.06))",
        border: "1px solid var(--trella-border)",
      }}
    />
  );
}

/** AI Sprint Analytics dashboard — metrics + charts always visible, AI insights on demand. */
function AiSprintAnalytics({
  velocitySprints,
  avgVelocity,
}: {
  velocitySprints: VelocitySprint[];
  avgVelocity: number;
}) {
  const { data, isFetching, isError, error, generate, isIdle } = useSprintAnalysis();

  const lastSprint = velocitySprints[velocitySprints.length - 1];
  const payload: SprintAnalysisRequest = {
    startDate: lastSprint?.startDate ?? undefined,
    endDate: lastSprint?.endDate ?? undefined,
    plannedPoints: lastSprint?.committed ?? 0,
    completedPoints: lastSprint?.completed ?? 0,
    velocity: avgVelocity,
  };
  const m = computeSprintMetrics(payload);
  const hasData = Boolean(data);

  return (
    <div style={{ marginBottom: 32 }}>
      <AnalyticsDashboardShell
        title="AI Sprint Analytics"
        subtitle={lastSprint?.sprintName}
        actions={
          <GenerateButton
            payload={payload}
            generate={generate}
            hasData={hasData}
            isFetching={isFetching}
          />
        }
      >
        {/* 1. Metrics — always visible, no AI required */}
        <MetricStrip>
          <MetricCard label="Completion rate" value={`${m.completionRate}%`} />
          <MetricCard label="Velocity" value={m.velocity ?? "—"} />
          <MetricCard label="Planned vs Completed" value={`${m.completedPoints}/${m.plannedPoints} SP`} />
          <MetricCard label="Completed sprints" value={velocitySprints.length} />
        </MetricStrip>

        {/* 2. Charts — always visible */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          <ChartCard title="Sprint completion">
            <SprintCompletionDonut completionRate={m.completionRate} />
          </ChartCard>
          <ChartCard title="Planned vs Completed (SP)">
            <PlannedVsCompletedBar planned={m.plannedPoints} completed={m.completedPoints} />
          </ChartCard>
          <ChartCard title="Velocity trend">
            <VelocityTrendChart
              data={velocitySprints.map((s) => ({ name: s.sprintName, velocity: s.completed }))}
            />
          </ChartCard>
        </div>

        {/* 3. AI insights area */}
        {isIdle ? (
          <Box>
            <Stack space="space.150" alignInline="center">
              <Text color="color.text.subtle">Generate an AI analysis of this sprint</Text>
              <GenerateButton
                payload={payload}
                generate={generate}
                hasData={hasData}
                isFetching={isFetching}
              />
            </Stack>
          </Box>
        ) : null}

        {isFetching ? (
          <Stack space="space.200">
            <SkeletonBlock height={96} />
            <SkeletonBlock />
            <SkeletonBlock />
          </Stack>
        ) : null}

        {isError && !isFetching ? (
          <SectionMessage
            appearance="error"
            title="Analysis failed"
            actions={[
              <Button key="retry" appearance="subtle" onClick={() => generate(payload)}>
                Retry
              </Button>,
            ]}
          >
            {String(error)}
          </SectionMessage>
        ) : null}

        {data && !isFetching ? (
          <Stack space="space.300">
            <InsightSection title="Executive summary">
              <ExecutiveSummaryBlock summary={data.executiveSummary} health={data.health} />
            </InsightSection>

            <InsightSection title="Sprint health" defaultOpen>
              <ExecutiveSummaryBlock summary={data.health.rationale} health={data.health} />
            </InsightSection>

            {data.risks && data.risks.length > 0 ? (
              <InsightSection title="Risks" count={data.risks.length}>
                <Stack space="space.150">
                  {data.risks.map((risk, i) => (
                    <RiskCard key={`risk-${i}`} risk={risk} />
                  ))}
                  <ChartCard title="AI risk assessment" caption="AI assessment — not a system metric">
                    <AiRiskAssessmentChart risks={data.risks ?? []} />
                  </ChartCard>
                </Stack>
              </InsightSection>
            ) : null}

            {data.blockers && data.blockers.length > 0 ? (
              <InsightSection title="Blockers" count={data.blockers.length}>
                <Stack space="space.150">
                  {data.blockers.map((blocker, i) => (
                    <BlockerCard key={`blocker-${i}`} blocker={blocker} />
                  ))}
                </Stack>
              </InsightSection>
            ) : null}

            {data.teamPerformance ? (
              <InsightSection title="Team performance">
                <TeamPerformanceBlock data={data.teamPerformance} />
              </InsightSection>
            ) : null}

            {data.recommendations && data.recommendations.length > 0 ? (
              <InsightSection title="Recommendations" count={data.recommendations.length}>
                <Stack space="space.150">
                  {data.recommendations.map((rec, i) => (
                    <RecommendationCard key={`rec-${i}`} rec={rec} />
                  ))}
                </Stack>
              </InsightSection>
            ) : null}

            {data.suggestedActions && data.suggestedActions.length > 0 ? (
              <InsightSection title="Suggested actions" count={data.suggestedActions.length}>
                <Stack space="space.150">
                  {data.suggestedActions.map((item, i) => (
                    <ActionCard key={`action-${i}`} item={item} />
                  ))}
                </Stack>
              </InsightSection>
            ) : null}
          </Stack>
        ) : null}

        {/* 4. Extensible slot */}
        <ExtensibleSlot
          title="Predictive insights"
          description="Forecasting & predictive analytics coming soon"
        />
      </AnalyticsDashboardShell>
    </div>
  );
}

export function ReportsPageClient({ workspaceId }: { workspaceId: string }) {
  const velocityQ = useQuery<SprintVelocityData>({
    queryKey: ["reports", workspaceId, "sprint-velocity"],
    queryFn: () => fetchReport(workspaceId, "sprint-velocity"),
  });

  const trendQ = useQuery<CompletionTrendData>({
    queryKey: ["reports", workspaceId, "completion-trend"],
    queryFn: () => fetchReport(workspaceId, "completion-trend"),
  });

  const velocitySprints = velocityQ.data?.sprints ?? [];
  const trendSprints = trendQ.data?.sprints ?? [];

  // Summary stats from velocity data
  const totalCompleted = velocitySprints.reduce((s, sp) => s + sp.completed, 0);
  const totalCommitted = velocitySprints.reduce((s, sp) => s + sp.committed, 0);
  const avgVelocity = velocitySprints.length
    ? Math.round(velocitySprints.reduce((s, sp) => s + sp.completed, 0) / velocitySprints.length)
    : 0;
  const lastSprint = velocitySprints[velocitySprints.length - 1];

  const isLoading = velocityQ.isLoading || trendQ.isLoading;

  if (isLoading) {
    return (
      <div style={{ padding: 32, color: "var(--trella-text-subtlest)", fontSize: 14 }}>Loading reports…</div>
    );
  }

  if (velocitySprints.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <p style={{ color: "var(--trella-text-subtle)", fontSize: 15, margin: 0 }}>
          No completed sprints yet. Reports will appear once you complete your first sprint.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 960, overflowY: "auto" }}>
      {/* AI Sprint Analytics — first thing managers see */}
      <AiSprintAnalytics velocitySprints={velocitySprints} avgVelocity={avgVelocity} />

      {/* KPI row */}
      <Section title="Sprint overview">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          <div style={STAT}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--trella-brand)" }}>{velocitySprints.length}</div>
            <div style={{ fontSize: 13, color: "var(--trella-text-subtle)", marginTop: 4 }}>Completed sprints</div>
          </div>
          <div style={STAT}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--trella-text)" }}>{avgVelocity}</div>
            <div style={{ fontSize: 13, color: "var(--trella-text-subtle)", marginTop: 4 }}>Avg story points / sprint</div>
          </div>
          <div style={STAT}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--trella-text)" }}>{totalCommitted > 0 ? Math.round(totalCompleted / totalCommitted * 100) : 0}%</div>
            <div style={{ fontSize: 13, color: "var(--trella-text-subtle)", marginTop: 4 }}>Overall completion rate</div>
          </div>
          {lastSprint && (
            <div style={STAT}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--trella-text)" }}>{lastSprint.completed}</div>
              <div style={{ fontSize: 13, color: "var(--trella-text-subtle)", marginTop: 4 }}>Points in last sprint</div>
            </div>
          )}
        </div>
      </Section>

      {/* Velocity chart */}
      <Section title="Sprint velocity — committed vs completed (story points)">
        <div style={{ background: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 8, padding: "16px 12px" }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={velocitySprints} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <XAxis dataKey="sprintName" tick={{ fontSize: 12, fill: "var(--trella-text-subtle)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--trella-text-subtle)" }} />
              <Tooltip
                contentStyle={{ fontSize: 13, background: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 6 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="committed" name="Committed" fill="#C1D7F5" radius={[3, 3, 0, 0]} />
              <Bar dataKey="completed" name="Completed" fill="#0052CC" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Completion trend */}
      {trendSprints.length > 1 && (
        <Section title="Task completion trend — tasks created vs completed per sprint">
          <div style={{ background: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 8, padding: "16px 12px" }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendSprints} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--trella-border)" />
                <XAxis dataKey="sprintName" tick={{ fontSize: 12, fill: "var(--trella-text-subtle)" }} />
                <YAxis tick={{ fontSize: 12, fill: "var(--trella-text-subtle)" }} />
                <Tooltip
                  contentStyle={{ fontSize: 13, background: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 6 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="created" name="Created" stroke="#C1D7F5" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#0052CC" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Sprint table */}
      <Section title="Sprint history">
        <div style={{ background: "var(--trella-surface)", border: "1px solid var(--trella-border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--trella-border)", background: "var(--trella-surface-sunken)" }}>
                {["Sprint", "Start", "End", "Tasks", "Committed pts", "Completed pts", "Rate"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "var(--trella-text-subtle)", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {velocitySprints.map((sp, i) => {
                const rate = sp.committed > 0 ? Math.round(sp.completed / sp.committed * 100) : 0;
                return (
                  <tr key={sp.sprintId} style={{ borderBottom: i < velocitySprints.length - 1 ? "1px solid var(--trella-border)" : "none" }}>
                    <td style={{ padding: "10px 12px", color: "var(--trella-text)", fontWeight: 500 }}>{sp.sprintName}</td>
                    <td style={{ padding: "10px 12px", color: "var(--trella-text-subtle)" }}>{sp.startDate ? sp.startDate.slice(0, 10) : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--trella-text-subtle)" }}>{sp.endDate ? sp.endDate.slice(0, 10) : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--trella-text-subtle)" }}>{sp.taskCount}</td>
                    <td style={{ padding: "10px 12px", color: "var(--trella-text-subtle)" }}>{sp.committed}</td>
                    <td style={{ padding: "10px 12px", color: "var(--trella-text-subtle)" }}>{sp.completed}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                        background: rate >= 80 ? "rgba(0,135,90,0.12)" : rate >= 50 ? "rgba(255,153,31,0.12)" : "rgba(222,53,11,0.12)",
                        color: rate >= 80 ? "#006644" : rate >= 50 ? "#974F0C" : "#AE2A19",
                      }}>
                        {rate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
