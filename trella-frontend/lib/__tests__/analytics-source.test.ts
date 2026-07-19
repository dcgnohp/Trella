import { describe, expect, it } from "vitest"

import {
  buildProjectAssistantRequest,
  buildSprintAnalysisRequest,
  isBlockedTask,
  isDoneTask,
  pickActiveSprint,
} from "@/lib/ai/analytics-source"
import type { SprintWithTasks, TaskPublic } from "@/lib/client"

// Minimal task factory — only the fields the builders read matter; the rest
// are cast away since the generated TaskPublic has many required fields.
function task(
  opts: {
    title?: string
    storyPoint?: number | null
    canonicalStatus?: string | null
    statusName?: string
  } = {}
): TaskPublic {
  return {
    title: opts.title ?? "task",
    storyPoint: opts.storyPoint ?? null,
    customStatus: {
      name: opts.statusName ?? "status",
      canonicalStatus: opts.canonicalStatus ?? null,
    },
  } as unknown as TaskPublic
}

function sprint(opts: Partial<SprintWithTasks>): SprintWithTasks {
  return {
    id: opts.id ?? "s1",
    projectId: "p1",
    name: opts.name ?? "Sprint",
    goal: opts.goal ?? null,
    status: opts.status ?? "PLANNED",
    startDate: opts.startDate ?? null,
    endDate: opts.endDate ?? null,
    tasks: opts.tasks,
    todoCount: opts.todoCount,
    inProgressCount: opts.inProgressCount,
    doneCount: opts.doneCount,
  } as unknown as SprintWithTasks
}

describe("task predicates", () => {
  it("detects done tasks", () => {
    expect(isDoneTask(task({ canonicalStatus: "DONE" }))).toBe(true)
    expect(isDoneTask(task({ canonicalStatus: "TODO" }))).toBe(false)
  })

  it("detects blocked tasks by canonical status or name", () => {
    expect(isBlockedTask(task({ canonicalStatus: "BLOCKED" }))).toBe(true)
    expect(isBlockedTask(task({ statusName: "Blocked" }))).toBe(true)
    expect(isBlockedTask(task({ statusName: "is blocking!" }))).toBe(true)
    expect(isBlockedTask(task({ statusName: "In Progress" }))).toBe(false)
  })
})

describe("pickActiveSprint", () => {
  it("returns the ACTIVE sprint", () => {
    const s = [
      sprint({ id: "a", status: "PLANNED", startDate: "2024-01-01" }),
      sprint({ id: "b", status: "ACTIVE", startDate: "2024-02-01" }),
    ]
    expect(pickActiveSprint(s)?.id).toBe("b")
  })

  it("falls back to most recent non-completed sprint", () => {
    const s = [
      sprint({ id: "old", status: "PLANNED", startDate: "2024-01-01" }),
      sprint({ id: "new", status: "PLANNED", startDate: "2024-03-01" }),
      sprint({ id: "done", status: "COMPLETED", startDate: "2024-05-01" }),
    ]
    expect(pickActiveSprint(s)?.id).toBe("new")
  })

  it("returns null when empty or all completed", () => {
    expect(pickActiveSprint([])).toBeNull()
    expect(
      pickActiveSprint([sprint({ id: "c", status: "COMPLETED" })])
    ).toBeNull()
  })
})

describe("buildSprintAnalysisRequest", () => {
  it("computes points and counts from active sprint tasks", () => {
    const active = sprint({
      id: "active",
      status: "ACTIVE",
      goal: "Ship it",
      startDate: "2024-02-01",
      endDate: "2024-02-14",
      tasks: [
        task({ title: "a", storyPoint: 3, canonicalStatus: "DONE" }),
        task({ title: "b", storyPoint: 5, canonicalStatus: "IN_PROGRESS" }),
        task({ title: "c", storyPoint: 2, canonicalStatus: "TODO" }),
        task({ title: "blocked one", storyPoint: 1, statusName: "Blocked" }),
      ],
    })
    const completed = sprint({
      id: "done1",
      status: "COMPLETED",
      tasks: [
        task({ storyPoint: 8, canonicalStatus: "DONE" }),
        task({ storyPoint: 2, canonicalStatus: "TODO" }),
      ],
    })

    const req = buildSprintAnalysisRequest([active, completed], [])
    expect(req).not.toBeNull()
    expect(req!.plannedPoints).toBe(11) // 3+5+2+1
    expect(req!.completedPoints).toBe(3) // only the DONE task
    expect(req!.doneCount).toBe(1)
    expect(req!.inProgressCount).toBe(1)
    expect(req!.todoCount).toBe(2) // TODO + blocked (no canonical)
    expect(req!.blockedTasks).toEqual(["blocked one"])
    expect(req!.velocity).toBe(8) // one completed sprint, 8 done points
    expect(req!.goal).toBe("Ship it")
  })

  it("prefers kanban counts when present", () => {
    const active = sprint({
      status: "ACTIVE",
      todoCount: 4,
      inProgressCount: 2,
      doneCount: 6,
      tasks: [],
    })
    const req = buildSprintAnalysisRequest([active], [])
    expect(req!.todoCount).toBe(4)
    expect(req!.inProgressCount).toBe(2)
    expect(req!.doneCount).toBe(6)
    expect(req!.velocity).toBeNull() // no completed sprints
  })

  it("returns null when there is no active/non-completed sprint", () => {
    expect(
      buildSprintAnalysisRequest([sprint({ status: "COMPLETED" })], [])
    ).toBeNull()
  })
})

describe("buildProjectAssistantRequest", () => {
  it("aggregates across sprints and backlog", () => {
    const sprints = [
      sprint({
        id: "1",
        status: "ACTIVE",
        startDate: "2024-03-01",
        todoCount: 2,
        inProgressCount: 1,
        doneCount: 3,
      }),
      sprint({
        id: "2",
        status: "COMPLETED",
        startDate: "2024-02-01",
        tasks: [
          task({ canonicalStatus: "DONE" }),
          task({ canonicalStatus: "TODO" }),
          task({ statusName: "Blocked" }),
        ],
      }),
    ]
    const backlog = [
      task({}),
      task({}),
      task({ statusName: "Blocked" }),
    ]

    const req = buildProjectAssistantRequest(sprints, backlog, "My Project")
    // sprint1 total = 6, sprint2 total = 3, backlog = 3 -> 12
    expect(req.totalTasks).toBe(12)
    // sprint1 done = 3, sprint2 done = 1 -> 4
    expect(req.doneTasks).toBe(4)
    // 1 blocked in sprint2 + 1 blocked in backlog
    expect(req.blockedTasks).toBe(2)
    expect(req.recentSprints!.length).toBeLessThanOrEqual(5)
    expect(req.activeSprint).not.toBeNull()
    expect(req.activeSprint!.name).toBe("Sprint")
    expect(req.name).toBe("My Project")
  })

  it("caps recentSprints at 5", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      sprint({ id: String(i), startDate: `2024-0${(i % 9) + 1}-01` })
    )
    const req = buildProjectAssistantRequest(many, [])
    expect(req.recentSprints!.length).toBe(5)
  })
})
