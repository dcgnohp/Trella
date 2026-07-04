'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { queryKeys } from '@/lib/query-keys';
import { X, CheckCircle2, RefreshCw, Plus, Clock } from 'lucide-react';

async function fetchSummary(workspaceId: string, endpoint: string) {
  const res = await fetch(`/api/summary/${workspaceId}/${endpoint}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: '#ef4444', HIGH: '#f97316', MEDIUM: '#3b82f6', LOW: 'var(--trella-text-subtle)',
};
const STATUS_COLORS = ['#3b82f6', '#f97316', '#8b5cf6', '#22c55e', 'var(--trella-text-subtle)'];

interface SummaryPageClientProps {
  workspaceId: string;
}

export function SummaryPageClient({ workspaceId }: SummaryPageClientProps) {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(`trella:summary-banner:${workspaceId}`);
    if (dismissed) setBannerDismissed(true);
  }, [workspaceId]);

  const dismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem(`trella:summary-banner:${workspaceId}`, '1');
  };

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

  const stats = statsQ.data ?? { completed_7d: 0, updated_7d: 0, created_7d: 0, due_soon_7d: 0 };
  const statusData: { name: string; count: number }[] = statusQ.data ?? [];
  const activityData: { user: string; action: string; task_title: string; time_ago: string }[] = activityQ.data ?? [];
  const priorityData: { priority: string; count: number }[] = priorityQ.data ?? [];
  const workTypesData: { type: string; count: number; total: number }[] = workTypesQ.data ?? [];
  const teamData: { member: string; assigned: number; completed: number }[] = teamQ.data ?? [];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--trella-surface-sunken)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 32px' }}>

        {/* Dismissible banner */}
        {!bannerDismissed && (
          <div style={{
            background: 'var(--trella-info-subtle)', border: '1px solid var(--trella-border)', borderRadius: 8,
            padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, color: 'var(--trella-info)', margin: '0 0 2px', fontSize: 14 }}>Customize your Summary view</p>
              <p style={{ color: 'var(--trella-text-subtle)', margin: 0, fontSize: 13 }}>Use filters to narrow down data and track your team&apos;s progress over time.</p>
            </div>
            <button onClick={dismissBanner} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--trella-text-subtlest)', padding: 2 }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--trella-text-subtle)' }}>Filter by:</span>
          {['Assignee', 'Priority', 'Type', 'Date range'].map(f => (
            <button key={f} style={{
              padding: '5px 12px', fontSize: 12, borderRadius: 999,
              border: '1px solid #e2e8f0', background: 'var(--trella-surface)', color: 'var(--trella-text)', cursor: 'pointer',
            }}>{f}</button>
          ))}
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatTile icon={<CheckCircle2 size={18} color="#22c55e" />} value={stats.completed_7d} label="Completed" sub="in last 7 days" color="#22c55e" />
          <StatTile icon={<RefreshCw size={18} color="#3b82f6" />} value={stats.updated_7d} label="Updated" sub="in last 7 days" color="#3b82f6" />
          <StatTile icon={<Plus size={18} color="#8b5cf6" />} value={stats.created_7d} label="Created" sub="in last 7 days" color="#8b5cf6" />
          <StatTile icon={<Clock size={18} color="#f97316" />} value={stats.due_soon_7d} label="Due soon" sub="in next 7 days" color="#f97316" />
        </div>

        {/* Status overview + Recent activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Card title="Status overview">
            {statusData.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <PieChart width={160} height={160}>
                  <Pie data={statusData} dataKey="count" nameKey="name" cx={80} cy={80} innerRadius={50} outerRadius={72} strokeWidth={2}>
                    {statusData.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [v ?? 0, 'tasks']} />
                </PieChart>
                <div style={{ flex: 1 }}>
                  {statusData.map((s, i) => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[i % STATUS_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--trella-text)', flex: 1 }}>{s.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--trella-text-subtle)', fontWeight: 600 }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState text="No status data yet" />
            )}
          </Card>

          <Card title="Recent activity">
            {activityData.length > 0 ? (
              <div>
                {activityData.slice(0, 6).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--trella-brand-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--trella-brand)' }}>{a.user?.[0]?.toUpperCase() ?? '?'}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--trella-text)', lineHeight: 1.4 }}>
                        <strong>{a.user}</strong> {a.action} <span style={{ color: 'var(--trella-brand)' }}>{a.task_title}</span>
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--trella-text-subtlest)', marginTop: 1 }}>{a.time_ago}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No recent activity" />
            )}
          </Card>
        </div>

        {/* Priority breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Card title="Priority breakdown">
            {priorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={priorityData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <XAxis dataKey="priority" tick={{ fontSize: 11, fill: 'var(--trella-text-subtle)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--trella-text-subtle)' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {priorityData.map((p, i) => <Cell key={i} fill={PRIORITY_COLORS[p.priority] ?? 'var(--trella-text-subtle)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="No priority data yet" />
            )}
          </Card>

          {/* Types of work */}
          <Card title="Types of work">
            {workTypesData.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--trella-text-subtlest)', fontWeight: 500, fontSize: 11 }}>TYPE</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--trella-text-subtlest)', fontWeight: 500, fontSize: 11 }}>COUNT</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--trella-text-subtlest)', fontWeight: 500, fontSize: 11 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {workTypesData.map((wt, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '7px 8px', color: 'var(--trella-text)' }}>{wt.type}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--trella-text)', fontWeight: 600 }}>{wt.count}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--trella-text-subtle)' }}>
                        {wt.total > 0 ? Math.round(wt.count / wt.total * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="No work type data yet" />
            )}
          </Card>
        </div>

        {/* Team workload */}
        <Card title="Team workload">
          {teamData.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {['Member', 'Assigned', 'Completed', 'Completion rate'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Member' ? 'left' : 'right', padding: '4px 12px', color: 'var(--trella-text-subtlest)', fontWeight: 500, fontSize: 11 }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamData.map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--trella-text)', fontWeight: 500 }}>{m.member}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--trella-text)' }}>{m.assigned}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--trella-text)' }}>{m.completed}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: 'var(--trella-border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${m.assigned > 0 ? Math.round(m.completed / m.assigned * 100) : 0}%`, background: '#22c55e', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--trella-text-subtle)', minWidth: 32, textAlign: 'right' }}>
                          {m.assigned > 0 ? Math.round(m.completed / m.assigned * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState text="No team data yet" />
          )}
        </Card>

      </div>
    </div>
  );
}

function StatTile({ icon, value, label, sub }: { icon: React.ReactNode; value: number; label: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--trella-surface)', borderRadius: 8, border: '1px solid #e2e8f0', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 13, color: 'var(--trella-text-subtle)' }}>{label}</span>
      </div>
      <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--trella-text)', margin: '0 0 2px' }}>{value}</p>
      <p style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', margin: 0 }}>{sub}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--trella-surface)', borderRadius: 8, border: '1px solid #e2e8f0', padding: '20px 20px 16px' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--trella-text)', margin: '0 0 16px' }}>{title}</p>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: '32px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--trella-text-subtlest)', margin: 0 }}>{text}</p>
    </div>
  );
}
