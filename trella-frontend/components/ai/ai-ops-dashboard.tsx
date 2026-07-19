'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import { Box, Stack, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';

import { useAuth } from '@/components/providers/auth-provider';
import { AnalyticsDashboardShell } from '@/components/ai/analytics/analytics-dashboard-shell';
import { MetricStrip } from '@/components/ai/analytics/metric-strip';
import { MetricCard } from '@/components/ai/analytics/metric-card';
import { ChartCard } from '@/components/ai/analytics/chart-card';
import {
  useAiMetrics,
  type KeyMetrics,
  type MetricsSnapshot,
} from '@/lib/ai/use-ai-metrics';

/** Sum a numeric field across all per-key rows. */
function sumBy(rows: KeyMetrics[], pick: (k: KeyMetrics) => number): number {
  return rows.reduce((acc, k) => acc + pick(k), 0);
}

function overallCacheHitRate(rows: KeyMetrics[]): number {
  const hits = sumBy(rows, (k) => k.cache_hits);
  const misses = sumBy(rows, (k) => k.cache_misses);
  const total = hits + misses;
  return total > 0 ? Math.round((hits / total) * 100) : 0;
}

/** Daily cost rollup → chart rows sorted by date ascending. */
function dailyCostSeries(snapshot: MetricsSnapshot): { day: string; cost: number }[] {
  return Object.entries(snapshot.daily)
    .map(([day, r]) => ({ day, cost: Number(r.total_cost.toFixed(4)) }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

const cell = { padding: '8px 10px', fontSize: 12, color: 'var(--trella-text)' } as const;
const head = {
  padding: '8px 10px',
  textAlign: 'left' as const,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--trella-text-subtle)',
};

/**
 * AI Ops metrics dashboard (P6-F1). Superuser-only view of the aggregate AI
 * platform metrics from `GET /ai/metrics`. Never shows prompt/response content
 * (the backend only exposes counters + cost aggregates).
 */
export function AiOpsDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const isSuperuser = !!user?.isSuperuser;
  const { data, isLoading, isError, error, refetch, isFetching } =
    useAiMetrics(isSuperuser);

  if (authLoading) {
    return <Box padding="space.400"><Text color="color.text.subtle">Loading…</Text></Box>;
  }

  if (!isSuperuser) {
    return (
      <Box padding="space.400">
        <SectionMessage appearance="warning" title="Superuser only">
          <Text>The AI Ops metrics dashboard is available to superusers only.</Text>
        </SectionMessage>
      </Box>
    );
  }

  const snapshot = data?.metrics;
  const rows: KeyMetrics[] = snapshot ? Object.values(snapshot.by_key) : [];
  const totalRequests = sumBy(rows, (k) => k.requests);
  const totalCost = sumBy(rows, (k) => k.total_cost);
  const daily = snapshot ? dailyCostSeries(snapshot) : [];

  return (
    <Box padding="space.400">
      <AnalyticsDashboardShell
        title="AI Ops"
        subtitle="Aggregate AI platform metrics (superuser)"
        actions={
          <Button appearance="default" onClick={() => refetch()} isLoading={isFetching}>
            Refresh
          </Button>
        }
      >
        {isError ? (
          <SectionMessage appearance="error" title="Couldn't load metrics">
            <Text>{error instanceof Error ? error.message : 'Request failed.'}</Text>
          </SectionMessage>
        ) : isLoading ? (
          <Text color="color.text.subtle">Loading metrics…</Text>
        ) : !snapshot || rows.length === 0 ? (
          <SectionMessage appearance="information" title="No AI activity yet">
            <Text>
              Metrics appear once AI requests run under a non-testing profile
              (production/development). Counters reset on restart.
            </Text>
          </SectionMessage>
        ) : (
          <Stack space="space.300">
            <MetricStrip>
              <MetricCard label="Total requests" value={totalRequests} />
              <MetricCard label="Total cost (USD)" value={`$${totalCost.toFixed(4)}`} />
              <MetricCard label="Cache hit rate" value={`${overallCacheHitRate(rows)}%`} />
              <MetricCard label="Recent traces" value={data?.recent_traces ?? 0} />
            </MetricStrip>

            {daily.length > 0 ? (
              <ChartCard title="Daily cost (USD)">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={token('color.border')} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="cost" name="Cost" fill={token('color.chart.brand', '#0052CC')} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            ) : null}

            <Box>
              <div style={{ overflowX: 'auto', border: '1px solid var(--trella-border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--trella-border)', background: 'var(--trella-surface-sunken)' }}>
                      {['Feature', 'Provider', 'Model', 'Reqs', 'OK', 'Fail', 'Cache h/m', 'Avg ms', 'Total $', '$/ok'].map((h) => (
                        <th key={h} style={head}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((k) => (
                      <tr key={`${k.feature}:${k.provider}:${k.model}`} style={{ borderBottom: '1px solid var(--trella-border)' }}>
                        <td style={cell}>{k.feature}</td>
                        <td style={cell}>{k.provider}</td>
                        <td style={cell}>{k.model}</td>
                        <td style={cell}>{k.requests}</td>
                        <td style={cell}>{k.successes}</td>
                        <td style={cell}>{k.failures}</td>
                        <td style={cell}>{k.cache_hits}/{k.cache_misses}</td>
                        <td style={cell}>{k.avg_latency_ms ?? '—'}</td>
                        <td style={cell}>${k.total_cost.toFixed(4)}</td>
                        <td style={cell}>
                          {k.cost_per_successful_request != null
                            ? `$${k.cost_per_successful_request.toFixed(4)}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Box>
          </Stack>
        )}
      </AnalyticsDashboardShell>
    </Box>
  );
}
