import { describe, expect, it } from "vitest"

import type { RiskItem } from "@/lib/client"

import { countRisksBySeverity } from "@/components/ai/analytics/charts/ai-risk-assessment-chart"

const risk = (severity: RiskItem["severity"]): RiskItem => ({
  title: `${severity} risk`,
  severity,
  rationale: "because",
})

describe("countRisksBySeverity", () => {
  it("returns the 4 severities in fixed order with correct counts", () => {
    const result = countRisksBySeverity([risk("high"), risk("high"), risk("low")])
    expect(result).toEqual([
      { severity: "low", count: 1 },
      { severity: "medium", count: 0 },
      { severity: "high", count: 2 },
      { severity: "critical", count: 0 },
    ])
  })

  it("returns all-zero counts for an empty array", () => {
    expect(countRisksBySeverity([])).toEqual([
      { severity: "low", count: 0 },
      { severity: "medium", count: 0 },
      { severity: "high", count: 0 },
      { severity: "critical", count: 0 },
    ])
  })
})
