import { describe, expect, it } from "vitest"

import {
  formatPreviousSummary,
  type AnalysisMemory,
} from "@/lib/ai/analysis-memory"

describe("formatPreviousSummary", () => {
  const base: AnalysisMemory = {
    executiveSummary: "Sprint is on track with minor scope creep.",
    generatedAt: "2024-05-01T12:00:00.000Z",
  }

  it("includes the generatedAt timestamp and the executive summary text", () => {
    const out = formatPreviousSummary(base)
    expect(out).toContain(base.generatedAt)
    expect(out).toContain(base.executiveSummary)
  })

  it("includes the health score when present", () => {
    const out = formatPreviousSummary({ ...base, healthScore: 72 })
    expect(out).toContain("(health 72)")
    expect(out).toContain(base.generatedAt)
    expect(out).toContain(base.executiveSummary)
  })

  it("omits the health score when null", () => {
    const out = formatPreviousSummary({ ...base, healthScore: null })
    expect(out).not.toContain("health")
  })

  it("omits the health score when undefined", () => {
    const out = formatPreviousSummary({ ...base, healthScore: undefined })
    expect(out).not.toContain("health")
  })

  it("includes a zero health score (not treated as absent)", () => {
    const out = formatPreviousSummary({ ...base, healthScore: 0 })
    expect(out).toContain("(health 0)")
  })
})
