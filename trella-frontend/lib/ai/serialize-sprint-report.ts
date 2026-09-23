import type { SprintAnalysisResponse } from "@/lib/client"

import type { SprintMetrics } from "@/lib/ai/analytics-metrics"

/**
 * Turns the structured AI sprint analysis into a single, professional
 * Markdown document. This is the "aggregation" output: one consolidated
 * report that can be copied into a doc, emailed, or pasted into a retro.
 *
 * Pure function (no DOM / React) so it stays testable — see
 * serialize-sprint-report.check.ts.
 */
export interface SerializeReportInput {
  sprintName?: string | null
  goal?: string | null
  startDate?: string | null
  endDate?: string | null
  metrics?: SprintMetrics | null
  analysis: SprintAnalysisResponse
  generatedAt?: Date
}

const HEALTH_LABEL: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function section(title: string, body: string[]): string[] {
  if (body.length === 0) return []
  return [`## ${title}`, "", ...body, ""]
}

export function serializeSprintReport(input: SerializeReportInput): string {
  const { analysis: a, metrics: m } = input
  const lines: string[] = []

  const title = input.sprintName?.trim() || "Sprint"
  lines.push(`# Sprint Retrospective — ${title}`, "")

  const meta: string[] = []
  const range = [fmtDate(input.startDate), fmtDate(input.endDate)].filter(
    Boolean
  )
  if (range.length) meta.push(`**Period:** ${range.join(" → ")}`)
  if (input.goal?.trim()) meta.push(`**Goal:** ${input.goal.trim()}`)
  const gen = input.generatedAt ?? new Date()
  meta.push(`**Generated:** ${gen.toLocaleString()}`)
  lines.push(...meta, "")

  // Health headline
  const healthLabel = HEALTH_LABEL[a.health.status] ?? a.health.status
  const score = a.health.score != null ? ` (${a.health.score}/100)` : ""
  lines.push(`**Health:** ${healthLabel}${score} — ${a.health.rationale}`, "")

  // Executive summary
  lines.push(...section("Executive Summary", [a.executiveSummary]))

  // Key metrics table
  if (m) {
    const rows: string[] = [
      "| Metric | Value |",
      "| --- | --- |",
      `| Completion rate | ${m.completionRate}% |`,
      `| Story points | ${m.completedPoints} / ${m.plannedPoints} done |`,
      `| Tasks | ${m.doneCount} / ${m.totalTasks} done |`,
      `| Remaining tasks | ${m.remainingCount} |`,
      `| Blocked | ${m.blockedCount} |`,
      `| Carry-over rate | ${m.carryOverRate}% |`,
    ]
    if (m.velocity != null) {
      rows.push(`| Avg velocity | ${m.velocity.toFixed(1)} SP/sprint |`)
    }
    lines.push(...section("Key Metrics", rows))
  }

  if (a.metricsCommentary) {
    lines.push(...section("Metrics Analysis", [a.metricsCommentary]))
  }

  if (a.wins?.length) {
    lines.push(...section("Wins", a.wins.map((w) => `- ✅ ${w}`)))
  }

  if (a.risks?.length) {
    lines.push(
      ...section(
        "Risks",
        a.risks.map((r) => {
          const like = r.likelihood ? `, likelihood: ${r.likelihood}` : ""
          const conf =
            r.confidence != null
              ? ` _(confidence ${Math.round(r.confidence * 100)}%)_`
              : ""
          return `- **[${r.severity.toUpperCase()}${like}] ${r.title}** — ${r.rationale}${conf}`
        })
      )
    )
  }

  if (a.blockers?.length) {
    lines.push(
      ...section(
        "Blockers",
        a.blockers.flatMap((b) => {
          const out = [`- **${b.title}** — ${b.impact}`]
          if (b.suggestedResolution) {
            out.push(`  - Resolution: ${b.suggestedResolution}`)
          }
          return out
        })
      )
    )
  }

  if (a.bottlenecks?.length) {
    lines.push(
      ...section(
        "Bottlenecks",
        a.bottlenecks.map((b) => {
          const area = b.area ? ` _(${b.area})_` : ""
          return `- **${b.title}**${area} — ${b.impact}`
        })
      )
    )
  }

  if (a.teamPerformance) {
    const tp = a.teamPerformance
    const body = [tp.summary, ""]
    if (tp.highlights?.length) {
      body.push("**Highlights:**", ...tp.highlights.map((h) => `- ${h}`), "")
    }
    if (tp.concerns?.length) {
      body.push("**Concerns:**", ...tp.concerns.map((c) => `- ${c}`))
    }
    lines.push(...section("Team Performance", body))
  }

  if (a.recommendations?.length) {
    lines.push(
      ...section(
        "Recommendations",
        a.recommendations.flatMap((r) => [
          `- **[${r.priority.toUpperCase()}] ${r.title}** _(confidence ${Math.round(
            r.confidence * 100
          )}%)_`,
          `  - Impact: ${r.expectedImpact}`,
          `  - Why: ${r.rationale}`,
        ])
      )
    )
  }

  if (a.suggestedActions?.length) {
    lines.push(
      ...section(
        "Next Actions",
        a.suggestedActions.map((s) => {
          const effort = s.effort ? ` (effort: ${s.effort.toUpperCase()})` : ""
          return `- [ ] **[${s.priority.toUpperCase()}]** ${s.action}${effort}`
        })
      )
    )
  }

  if (a.managerChecklist?.length) {
    lines.push(
      ...section(
        "Manager Checklist",
        a.managerChecklist.map((c) => {
          const p = c.priority ? `[${c.priority.toUpperCase()}] ` : ""
          return `- [ ] ${p}${c.label}`
        })
      )
    )
  }

  if (a.changesSinceLast) {
    lines.push(...section("Changes Since Last Sprint", [a.changesSinceLast]))
  }

  // Collapse trailing blank lines to a single newline.
  return lines.join("\n").replace(/\n{3,}$/g, "\n").trimEnd() + "\n"
}
