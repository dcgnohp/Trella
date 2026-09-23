"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  Gauge,
  Lightbulb,
  ListChecks,
  Rocket,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

import type { SprintAnalysisResponse } from "@/lib/client";
import type { SprintMetrics } from "@/lib/ai/analytics-metrics";
import { serializeSprintReport } from "@/lib/ai/serialize-sprint-report";

interface AiSprintReportProps {
  analysis: SprintAnalysisResponse;
  metrics: SprintMetrics | null;
  sprintName?: string | null;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

const HEALTH: Record<string, { label: string; bg: string; fg: string }> = {
  on_track: { label: "On Track", bg: "#F0FDF4", fg: "#16A34A" },
  at_risk: { label: "At Risk", bg: "#FFFBEB", fg: "#D97706" },
  off_track: { label: "Off Track", bg: "#FEF2F2", fg: "#DC2626" },
};

const SEVERITY: Record<string, { bg: string; fg: string }> = {
  low: { bg: "#EFF6FF", fg: "#2563EB" },
  medium: { bg: "#FFFBEB", fg: "#D97706" },
  high: { bg: "#FFF7ED", fg: "#EA580C" },
  critical: { bg: "#FEF2F2", fg: "#DC2626" },
};

const PRIORITY: Record<string, { bg: string; fg: string }> = {
  low: { bg: "#F1F5F9", fg: "#475569" },
  medium: { bg: "#EFF6FF", fg: "#2563EB" },
  high: { bg: "#FEF2F2", fg: "#DC2626" },
};

export function AiSprintReport({
  analysis: a,
  metrics: m,
  sprintName,
  goal,
  startDate,
  endDate,
}: AiSprintReportProps) {
  const [copied, setCopied] = useState(false);

  const buildMarkdown = () =>
    serializeSprintReport({
      sprintName,
      goal,
      startDate,
      endDate,
      metrics: m,
      analysis: a,
    });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the download button still works */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([buildMarkdown()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Sprint_Retro_${(sprintName || "Sprint").replace(/\s+/g, "_")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const health = HEALTH[a.health.status] ?? {
    label: a.health.status,
    bg: "#F1F5F9",
    fg: "#475569",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Health headline + export controls */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              backgroundColor: health.bg,
              color: health.fg,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Gauge size={20} />
            <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
              {a.health.score != null ? a.health.score : "—"}
            </span>
          </div>
          <div>
            <span
              style={{
                display: "inline-block",
                padding: "3px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                backgroundColor: health.bg,
                color: health.fg,
                marginBottom: 6,
              }}
            >
              {health.label}
            </span>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", maxWidth: 520, lineHeight: 1.5 }}>
              {a.health.rationale}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleCopy} style={exportBtn}>
            <Copy size={14} />
            {copied ? "Copied" : "Copy report"}
          </button>
          <button onClick={handleDownload} style={exportBtn}>
            <Download size={14} />
            Export .md
          </button>
        </div>
      </div>

      <Section icon={<TrendingUp size={16} color="#2563EB" />} title="Executive Summary">
        <p style={paragraph}>{a.executiveSummary}</p>
      </Section>

      {m && (
        <Section icon={<Gauge size={16} color="#2563EB" />} title="Key Metrics">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <Stat label="Completion" value={`${m.completionRate}%`} tone="#2563EB" />
            <Stat label="Story Points" value={`${m.completedPoints}/${m.plannedPoints}`} sub="done / planned" tone="#10B981" />
            <Stat label="Tasks Done" value={`${m.doneCount}/${m.totalTasks}`} tone="#0F172A" />
            <Stat label="Remaining" value={`${m.remainingCount}`} tone="#D97706" />
            <Stat label="Blocked" value={`${m.blockedCount}`} tone="#DC2626" />
            <Stat label="Carry-over" value={`${m.carryOverRate}%`} tone="#8B5CF6" />
            {m.velocity != null && (
              <Stat label="Avg Velocity" value={`${m.velocity.toFixed(1)} SP`} tone="#0EA5E9" />
            )}
          </div>
          {a.metricsCommentary && <p style={{ ...paragraph, marginTop: 14 }}>{a.metricsCommentary}</p>}
        </Section>
      )}

      {a.wins && a.wins.length > 0 && (
        <Section icon={<CheckCircle2 size={16} color="#16A34A" />} title="Wins">
          <ul style={list}>
            {a.wins.map((w, i) => (
              <li key={i} style={listItem}>{w}</li>
            ))}
          </ul>
        </Section>
      )}

      {a.risks && a.risks.length > 0 && (
        <Section icon={<ShieldAlert size={16} color="#DC2626" />} title="Risks">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {a.risks.map((r, i) => {
              const s = SEVERITY[r.severity] ?? SEVERITY.medium;
              return (
                <Card key={i}>
                  <div style={cardHead}>
                    <span style={{ fontWeight: 700, color: "#0F172A", fontSize: 13 }}>{r.title}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Badge bg={s.bg} fg={s.fg}>{r.severity.toUpperCase()}</Badge>
                      {r.likelihood && <Badge bg="#F1F5F9" fg="#475569">{r.likelihood} likelihood</Badge>}
                      {r.confidence != null && (
                        <Badge bg="#F1F5F9" fg="#475569">{Math.round(r.confidence * 100)}% conf.</Badge>
                      )}
                    </div>
                  </div>
                  <p style={cardBody}>{r.rationale}</p>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {a.blockers && a.blockers.length > 0 && (
        <Section icon={<AlertTriangle size={16} color="#EA580C" />} title="Blockers">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {a.blockers.map((b, i) => (
              <Card key={i}>
                <div style={cardHead}>
                  <span style={{ fontWeight: 700, color: "#0F172A", fontSize: 13 }}>{b.title}</span>
                </div>
                <p style={cardBody}>{b.impact}</p>
                {b.suggestedResolution && (
                  <p style={{ ...cardBody, color: "#16A34A", marginTop: 4 }}>
                    → {b.suggestedResolution}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </Section>
      )}

      {a.bottlenecks && a.bottlenecks.length > 0 && (
        <Section icon={<AlertTriangle size={16} color="#D97706" />} title="Bottlenecks">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {a.bottlenecks.map((b, i) => (
              <Card key={i}>
                <div style={cardHead}>
                  <span style={{ fontWeight: 700, color: "#0F172A", fontSize: 13 }}>{b.title}</span>
                  {b.area && <Badge bg="#F1F5F9" fg="#475569">{b.area}</Badge>}
                </div>
                <p style={cardBody}>{b.impact}</p>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {a.teamPerformance && (
        <Section icon={<Users size={16} color="#2563EB" />} title="Team Performance">
          <p style={paragraph}>{a.teamPerformance.summary}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
            {a.teamPerformance.highlights && a.teamPerformance.highlights.length > 0 && (
              <div>
                <div style={subHead}>Highlights</div>
                <ul style={list}>
                  {a.teamPerformance.highlights.map((h, i) => (
                    <li key={i} style={{ ...listItem, color: "#16A34A" }}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            {a.teamPerformance.concerns && a.teamPerformance.concerns.length > 0 && (
              <div>
                <div style={subHead}>Concerns</div>
                <ul style={list}>
                  {a.teamPerformance.concerns.map((c, i) => (
                    <li key={i} style={{ ...listItem, color: "#DC2626" }}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {a.recommendations && a.recommendations.length > 0 && (
        <Section icon={<Lightbulb size={16} color="#D97706" />} title="Recommendations">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {a.recommendations.map((r, i) => {
              const p = PRIORITY[r.priority] ?? PRIORITY.medium;
              return (
                <Card key={i}>
                  <div style={cardHead}>
                    <span style={{ fontWeight: 700, color: "#0F172A", fontSize: 13 }}>{r.title}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Badge bg={p.bg} fg={p.fg}>{r.priority.toUpperCase()}</Badge>
                      <Badge bg="#F1F5F9" fg="#475569">{Math.round(r.confidence * 100)}% conf.</Badge>
                    </div>
                  </div>
                  <p style={cardBody}><strong style={{ color: "#0F172A" }}>Impact:</strong> {r.expectedImpact}</p>
                  <p style={{ ...cardBody, marginTop: 2 }}><strong style={{ color: "#0F172A" }}>Why:</strong> {r.rationale}</p>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {a.suggestedActions && a.suggestedActions.length > 0 && (
        <Section icon={<Rocket size={16} color="#7C3AED" />} title="Next Actions">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {a.suggestedActions.map((s, i) => {
              const p = PRIORITY[s.priority] ?? PRIORITY.medium;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#334155" }}>
                  <Badge bg={p.bg} fg={p.fg}>{s.priority.toUpperCase()}</Badge>
                  <span style={{ flex: 1 }}>{s.action}</span>
                  {s.effort && <Badge bg="#F1F5F9" fg="#475569">effort {s.effort.toUpperCase()}</Badge>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {a.managerChecklist && a.managerChecklist.length > 0 && (
        <Section icon={<ClipboardList size={16} color="#0F172A" />} title="Manager Checklist">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {a.managerChecklist.map((c, i) => (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#334155", cursor: "pointer" }}>
                <input type="checkbox" style={{ width: 15, height: 15 }} />
                <span>{c.label}</span>
                {c.priority && <Badge bg="#F1F5F9" fg="#475569">{c.priority}</Badge>}
              </label>
            ))}
          </div>
        </Section>
      )}

      {a.changesSinceLast && (
        <Section icon={<ListChecks size={16} color="#0EA5E9" />} title="Changes Since Last Sprint">
          <p style={paragraph}>{a.changesSinceLast}</p>
        </Section>
      )}
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--trella-border-subtle, #F1F5F9)", paddingTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {icon}
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--trella-text, #0F172A)", textTransform: "uppercase", letterSpacing: 0.4 }}>
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div style={{ backgroundColor: "var(--trella-surface-sunken, #F8FAFC)", padding: 12, borderRadius: 10, border: "1px solid var(--trella-border, #E2E8F0)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--trella-text-subtle, #64748B)", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: tone, margin: "2px 0" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--trella-text-subtlest, #94A3B8)" }}>{sub}</div>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "var(--trella-surface, #F8FAFC)", border: "1px solid var(--trella-border, #E2E8F0)", borderRadius: 10, padding: 14 }}>
      {children}
    </div>
  );
}

function Badge({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, backgroundColor: bg, color: fg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

const paragraph: React.CSSProperties = { margin: 0, fontSize: 13.5, color: "var(--trella-text, #334155)", lineHeight: 1.65 };
const list: React.CSSProperties = { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 };
const listItem: React.CSSProperties = { fontSize: 13, color: "var(--trella-text, #334155)", lineHeight: 1.5 };
const cardHead: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" };
const cardBody: React.CSSProperties = { margin: 0, fontSize: 12.5, color: "var(--trella-text-subtle, #475569)", lineHeight: 1.55 };
const subHead: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--trella-text-subtle, #64748B)", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.3 };
const exportBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 8,
  backgroundColor: "var(--trella-surface, #FFFFFF)",
  border: "1px solid var(--trella-border, #CBD5E1)",
  color: "var(--trella-text, #0F172A)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
