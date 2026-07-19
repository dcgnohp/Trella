import type {
  SprintWithTasks,
  TaskPublic,
  SprintAnalysisRequest,
  ProjectAssistantRequest,
  ProjectSprintSummary,
} from "@/lib/client"

// Pure builders that turn the REAL workspace source (sprints + backlog) into
// the payloads the AI endpoints expect. No React here — see
// use-workspace-analytics-data.ts for the data-fetching hook.

const MAX_BLOCKED_TASKS = 20

export function isDoneTask(t: TaskPublic): boolean {
  return t.customStatus?.canonicalStatus === "DONE"
}

export function isBlockedTask(t: TaskPublic): boolean {
  return (
    t.customStatus?.canonicalStatus === "BLOCKED" ||
    /block/i.test(t.customStatus?.name ?? "")
  )
}

export function pickActiveSprint(
  sprints: SprintWithTasks[]
): SprintWithTasks | null {
  const active = sprints.find((s) => s.status === "ACTIVE")
  if (active) return active

  // Fall back to the most recent non-completed sprint by startDate.
  // ponytail: startDate is an ISO string, so lexical compare == chronological.
  const candidates = sprints.filter((s) => s.status !== "COMPLETED")
  if (candidates.length === 0) return null

  return candidates.reduce((best, s) => {
    const bestDate = best.startDate ?? ""
    const sDate = s.startDate ?? ""
    return sDate > bestDate ? s : best
  })
}

function sumPoints(tasks: TaskPublic[]): number {
  return tasks.reduce((acc, t) => acc + (t.storyPoint ?? 0), 0)
}

/** Completed points for a sprint = sum of its done tasks' story points. */
function completedPointsOf(sprint: SprintWithTasks): number {
  return sumPoints((sprint.tasks ?? []).filter(isDoneTask))
}

/**
 * Total task count for a sprint: prefer the kanban counts when any are
 * present, otherwise fall back to the embedded tasks length.
 */
function totalCountOf(sprint: SprintWithTasks): number {
  const { todoCount, inProgressCount, doneCount } = sprint
  if (
    todoCount !== undefined ||
    inProgressCount !== undefined ||
    doneCount !== undefined
  ) {
    return (todoCount ?? 0) + (inProgressCount ?? 0) + (doneCount ?? 0)
  }
  return (sprint.tasks ?? []).length
}

function doneCountOf(sprint: SprintWithTasks): number {
  if (sprint.doneCount !== undefined) return sprint.doneCount
  return (sprint.tasks ?? []).filter(isDoneTask).length
}

function completionRateOf(sprint: SprintWithTasks): number | null {
  const total = totalCountOf(sprint)
  if (total <= 0) return null
  return doneCountOf(sprint) / total
}

function toSprintSummary(sprint: SprintWithTasks): ProjectSprintSummary {
  return {
    name: sprint.name,
    status: sprint.status,
    completionRate: completionRateOf(sprint),
  }
}

/** Sort sprints by startDate DESC (nulls last), non-mutating. */
function byStartDateDesc(sprints: SprintWithTasks[]): SprintWithTasks[] {
  return [...sprints].sort((a, b) => {
    const aDate = a.startDate ?? ""
    const bDate = b.startDate ?? ""
    if (aDate === bDate) return 0
    if (aDate === "") return 1
    if (bDate === "") return -1
    return bDate > aDate ? 1 : -1
  })
}

export function buildSprintAnalysisRequest(
  sprints: SprintWithTasks[],
  backlog: TaskPublic[]
): SprintAnalysisRequest | null {
  const active = pickActiveSprint(sprints)
  if (!active) return null

  const tasks = active.tasks ?? []
  const plannedPoints = sumPoints(tasks)
  const completedPoints = sumPoints(tasks.filter(isDoneTask))

  let todoCount: number
  let inProgressCount: number
  let doneCount: number
  if (
    active.todoCount !== undefined ||
    active.inProgressCount !== undefined ||
    active.doneCount !== undefined
  ) {
    todoCount = active.todoCount ?? 0
    inProgressCount = active.inProgressCount ?? 0
    doneCount = active.doneCount ?? 0
  } else {
    doneCount = tasks.filter(isDoneTask).length
    inProgressCount = tasks.filter(
      (t) => t.customStatus?.canonicalStatus === "IN_PROGRESS"
    ).length
    todoCount = tasks.length - doneCount - inProgressCount
  }

  // Velocity: average completed points across all COMPLETED sprints.
  const completedSprints = sprints.filter((s) => s.status === "COMPLETED")
  const velocity =
    completedSprints.length > 0
      ? completedSprints.reduce((acc, s) => acc + completedPointsOf(s), 0) /
        completedSprints.length
      : null

  const blockedTasks = tasks
    .filter(isBlockedTask)
    .map((t) => t.title)
    .slice(0, MAX_BLOCKED_TASKS)

  return {
    goal: active.goal,
    status: active.status,
    startDate: active.startDate,
    endDate: active.endDate,
    plannedPoints,
    completedPoints,
    todoCount,
    inProgressCount,
    doneCount,
    velocity,
    blockedTasks,
    carriedOverTasks: [], // unknown from this source
  }
}

export function buildProjectAssistantRequest(
  sprints: SprintWithTasks[],
  backlog: TaskPublic[],
  name?: string
): ProjectAssistantRequest {
  const recentSprints = byStartDateDesc(sprints).slice(0, 5).map(toSprintSummary)

  const active = pickActiveSprint(sprints)
  const activeSprint = active ? toSprintSummary(active) : null

  const totalTasks =
    sprints.reduce((acc, s) => acc + totalCountOf(s), 0) + backlog.length
  const doneTasks = sprints.reduce((acc, s) => acc + doneCountOf(s), 0)

  const blockedInSprints = sprints.reduce(
    (acc, s) => acc + (s.tasks ?? []).filter(isBlockedTask).length,
    0
  )
  const blockedTasks = blockedInSprints + backlog.filter(isBlockedTask).length

  return {
    name,
    recentSprints,
    activeSprint,
    totalTasks,
    doneTasks,
    blockedTasks,
    knownRisks: [],
  }
}
