import { describe, expect, it } from "vitest"

import {
  hashPayload,
  validateProjectPayload,
  validateSprintPayload,
} from "@/lib/ai/analytics-payload"

describe("hashPayload", () => {
  it("is identical for equal payloads regardless of key order", () => {
    const a = { goal: "Ship", plannedPoints: 10, blockedTasks: ["x"] }
    const b = { blockedTasks: ["x"], plannedPoints: 10, goal: "Ship" }
    expect(hashPayload(a)).toBe(hashPayload(b))
  })

  it("sorts nested object keys too", () => {
    const a = { activeSprint: { name: "S1", status: "ACTIVE" } }
    const b = { activeSprint: { status: "ACTIVE", name: "S1" } }
    expect(hashPayload(a)).toBe(hashPayload(b))
  })

  it("differs for different payloads", () => {
    expect(hashPayload({ goal: "A" })).not.toBe(hashPayload({ goal: "B" }))
  })
})

describe("validateSprintPayload", () => {
  it("reports not_enough_data on an empty payload", () => {
    const r = validateSprintPayload({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("not_enough_data")
  })

  it("reports inconsistent when completed points exceed planned", () => {
    const r = validateSprintPayload({ plannedPoints: 10, completedPoints: 15 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe("inconsistent")
      expect(r.message).toBe("Completed points exceed planned points.")
    }
  })

  it("reports inconsistent on negative values", () => {
    const r = validateSprintPayload({ doneCount: -1 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe("inconsistent")
      expect(r.message).toBe("Metrics contain invalid negative values.")
    }
  })

  it("is ok for a valid payload", () => {
    const r = validateSprintPayload({ plannedPoints: 20, completedPoints: 12 })
    expect(r.ok).toBe(true)
  })
})

describe("validateProjectPayload", () => {
  it("reports not_enough_data on an empty payload", () => {
    const r = validateProjectPayload({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("not_enough_data")
  })

  it("reports inconsistent when done tasks exceed total", () => {
    const r = validateProjectPayload({ totalTasks: 10, doneTasks: 15 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("inconsistent")
  })

  it("is ok for a valid payload", () => {
    const r = validateProjectPayload({ totalTasks: 10, doneTasks: 4 })
    expect(r.ok).toBe(true)
  })
})
