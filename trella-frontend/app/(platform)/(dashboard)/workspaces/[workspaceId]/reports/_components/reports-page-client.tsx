"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";

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

import React from "react";

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
