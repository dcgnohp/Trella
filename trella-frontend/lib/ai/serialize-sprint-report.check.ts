/**
 * Minimal runnable self-check for serializeSprintReport (no test framework).
 * Run with:  npx tsx lib/ai/serialize-sprint-report.check.ts
 *
 * Fails loudly if the serializer drops a section or mangles the structure.
 */
import assert from "node:assert/strict"

import type { SprintAnalysisResponse } from "@/lib/client"

import { serializeSprintReport } from "./serialize-sprint-report"

const analysis: SprintAnalysisResponse = {
  executiveSummary: "Sprint landed most of its scope with one blocker.",
  health: { status: "at_risk", score: 72, rationale: "Review queue backed up." },
  metricsCommentary: "Completion dipped due to late-arriving scope.",
  risks: [
    {
      title: "Review bottleneck",
      severity: "high",
      likelihood: "high",
      rationale: "One reviewer owns all API PRs.",
      confidence: 0.8,
    },
  ],
  blockers: [
    {
      title: "OAuth endpoint flaky",
      impact: "Blocks 3 downstream tasks.",
      suggestedResolution: "Add regression tests.",
    },
  ],
  bottlenecks: [{ title: "Code review", impact: "6d queue", area: "Backend" }],
  teamPerformance: {
    summary: "Strong delivery, uneven load.",
    highlights: ["Frontend ahead of plan"],
    concerns: ["Backend overloaded"],
  },
  recommendations: [
    {
      title: "Add second reviewer",
      priority: "high",
      confidence: 0.9,
      expectedImpact: "Cut review time 40%.",
      rationale: "Single reviewer is the constraint.",
    },
  ],
  suggestedActions: [
    { action: "Reassign 2 review tasks", priority: "high", effort: "s" },
  ],
  wins: ["Shipped auth engine"],
  managerChecklist: [{ label: "Confirm reviewer rotation", priority: "high" }],
  changesSinceLast: "Velocity up 14% vs previous sprint.",
}

const md = serializeSprintReport({
  sprintName: "Sprint 24",
  goal: "Complete OAuth & Gantt engine",
  startDate: "2026-07-16",
  endDate: "2026-07-30",
  metrics: {
    completionRate: 90,
    velocity: 40,
    plannedPoints: 45,
    completedPoints: 42,
    carryOverRate: 5,
    blockedCount: 1,
    remainingCount: 4,
    totalTasks: 20,
    doneCount: 18,
  },
  analysis,
  generatedAt: new Date("2026-07-22T10:00:00Z"),
})

// Every section the AI returns must survive into the report.
for (const heading of [
  "# Sprint Retrospective — Sprint 24",
  "## Executive Summary",
  "## Key Metrics",
  "## Metrics Analysis",
  "## Wins",
  "## Risks",
  "## Blockers",
  "## Bottlenecks",
  "## Team Performance",
  "## Recommendations",
  "## Next Actions",
  "## Manager Checklist",
  "## Changes Since Last Sprint",
]) {
  assert.ok(md.includes(heading), `missing section: ${heading}`)
}

// Structured details must be rendered, not just the headings.
assert.ok(md.includes("At Risk (72/100)"), "health headline missing")
assert.ok(md.includes("| Completion rate | 90% |"), "metrics table missing")
assert.ok(md.includes("[HIGH, likelihood: high] Review bottleneck"), "risk detail missing")
assert.ok(md.includes("Resolution: Add regression tests."), "blocker resolution missing")
assert.ok(md.includes("confidence 90%"), "recommendation confidence missing")

// Empty analysis must not crash and must not emit optional sections.
const bare = serializeSprintReport({
  sprintName: "Empty",
  analysis: {
    executiveSummary: "No data yet.",
    health: { status: "on_track", rationale: "n/a" },
  },
})
assert.ok(!bare.includes("## Risks"), "empty report leaked a Risks section")
assert.ok(bare.includes("## Executive Summary"), "empty report missing summary")

console.log("serialize-sprint-report self-check passed")
