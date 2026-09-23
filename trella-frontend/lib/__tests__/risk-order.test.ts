import { describe, expect, it } from "vitest"

import type { RiskItem } from "@/lib/client"
import { sortRisksByImportance } from "@/lib/ai/risk-order"

function risk(
  title: string,
  severity: RiskItem["severity"],
  confidence?: number,
): RiskItem {
  return { title, severity, rationale: "r", confidence } as RiskItem
}

describe("sortRisksByImportance", () => {
  it("orders by severity critical > high > medium > low", () => {
    const input = [
      risk("low", "low"),
      risk("critical", "critical"),
      risk("medium", "medium"),
      risk("high", "high"),
    ]
    expect(sortRisksByImportance(input).map((r) => r.title)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ])
  })

  it("breaks ties within a severity by higher confidence first", () => {
    const input = [
      risk("low-conf", "high", 0.2),
      risk("high-conf", "high", 0.9),
      risk("no-conf", "high"),
    ]
    expect(sortRisksByImportance(input).map((r) => r.title)).toEqual([
      "high-conf",
      "low-conf",
      "no-conf",
    ])
  })

  it("does not mutate the input array", () => {
    const input = [risk("a", "low"), risk("b", "critical")]
    const copy = [...input]
    sortRisksByImportance(input)
    expect(input).toEqual(copy)
  })
})
