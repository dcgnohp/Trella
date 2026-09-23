import { describe, expect, it } from "vitest"

import {
  computeProjectMetrics,
  computeSprintMetrics,
} from "@/lib/ai/analytics-metrics"

describe("computeSprintMetrics", () => {
  it("uses points-based completion when planned points > 0", () => {
    const m = computeSprintMetrics({ plannedPoints: 20, completedPoints: 12 })
    expect(m.completionRate).toBe(60)
    expect(m.plannedPoints).toBe(20)
    expect(m.completedPoints).toBe(12)
  })

  it("falls back to task-based completion when no planned points", () => {
    const m = computeSprintMetrics({
      todoCount: 2,
      inProgressCount: 1,
      doneCount: 1,
    })
    // done 1 / total 4 = 25
    expect(m.completionRate).toBe(25)
    expect(m.totalTasks).toBe(4)
    expect(m.doneCount).toBe(1)
  })

  it("computes carryOverRate and remaining count", () => {
    const m = computeSprintMetrics({
      todoCount: 3,
      inProgressCount: 1,
      doneCount: 0,
      carriedOverTasks: ["A", "B"],
      blockedTasks: ["X"],
    })
    // carried 2 / total 4 = 50
    expect(m.carryOverRate).toBe(50)
    expect(m.remainingCount).toBe(4)
    expect(m.blockedCount).toBe(1)
  })

  it("returns zeros for an empty payload", () => {
    const m = computeSprintMetrics({})
    expect(m.completionRate).toBe(0)
    expect(m.carryOverRate).toBe(0)
    expect(m.velocity).toBeNull()
  })
})

describe("computeProjectMetrics", () => {
  it("computes doneRate from total/done tasks", () => {
    const m = computeProjectMetrics({ totalTasks: 50, doneTasks: 20 })
    expect(m.doneRate).toBe(40)
    expect(m.totalTasks).toBe(50)
    expect(m.doneTasks).toBe(20)
  })

  it("returns 0 doneRate when there are no tasks", () => {
    const m = computeProjectMetrics({})
    expect(m.doneRate).toBe(0)
    expect(m.sprintCount).toBe(0)
  })

  it("counts recent sprints", () => {
    const m = computeProjectMetrics({
      recentSprints: [{ name: "S1" }, { name: "S2" }],
    })
    expect(m.sprintCount).toBe(2)
  })
})
