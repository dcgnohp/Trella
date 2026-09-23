import { describe, expect, it } from "vitest"

import {
  formatConfidence,
  priorityAppearance,
  severityMeta,
  statusAppearance,
} from "@/components/ai/primitives/mappings"

describe("statusAppearance", () => {
  it("maps semantic tones to ADS Lozenge appearances", () => {
    expect(statusAppearance("success")).toBe("success")
    expect(statusAppearance("warning")).toBe("moved")
    expect(statusAppearance("danger")).toBe("removed")
    expect(statusAppearance("neutral")).toBe("default")
  })
})

describe("priorityAppearance", () => {
  it("maps priorities to ADS Lozenge appearances", () => {
    expect(priorityAppearance("low")).toBe("default")
    expect(priorityAppearance("medium")).toBe("moved")
    expect(priorityAppearance("high")).toBe("removed")
  })
})

describe("severityMeta", () => {
  it("returns a non-empty label and a color token for every severity", () => {
    for (const sev of ["low", "medium", "high", "critical"] as const) {
      const meta = severityMeta(sev)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.colorToken).toMatch(/^color\./)
    }
  })
})

describe("formatConfidence", () => {
  it("rounds a 0-1 confidence to an integer percentage", () => {
    expect(formatConfidence(0.826)).toBe(83)
  })

  it("clamps out-of-range values into [0, 100]", () => {
    expect(formatConfidence(1.5)).toBe(100)
    expect(formatConfidence(-1)).toBe(0)
  })
})
