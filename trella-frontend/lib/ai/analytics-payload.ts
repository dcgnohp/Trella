import type {
  ProjectAssistantRequest,
  SprintAnalysisRequest,
} from "@/lib/client"

/**
 * Stable, order-independent serialization of any JSON-safe value.
 *
 * Recursively sorts object keys so two structurally-equal payloads produce an
 * identical string regardless of the order their keys were built in. Used as a
 * React Query cache key, so equal payloads reuse the cache (no extra LLM call).
 *
 * ponytail: the sorted-key JSON string *is* the hash. It is longer than a
 * digest but fully deterministic and collision-free, which is all a query key
 * needs. Upgrade path: wrap in a real digest (e.g. SHA-256) only if key length
 * ever becomes a problem.
 */
export function hashPayload(payload: unknown): string {
  return JSON.stringify(sortValue(payload))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: "not_enough_data" | "inconsistent"; message: string }

/** Collect the numeric metric fields relevant to a sprint payload. */
function sprintNumbers(p: SprintAnalysisRequest): number[] {
  return [
    p.plannedPoints,
    p.completedPoints,
    p.todoCount,
    p.inProgressCount,
    p.doneCount,
    p.velocity,
  ].filter((n): n is number => typeof n === "number")
}

export function validateSprintPayload(p: SprintAnalysisRequest): ValidationResult {
  const taskTotal = (p.todoCount || 0) + (p.inProgressCount || 0) + (p.doneCount || 0)
  const hasBlocked = (p.blockedTasks?.length || 0) > 0
  const hasCarried = (p.carriedOverTasks?.length || 0) > 0

  if (
    !p.goal &&
    (p.plannedPoints || 0) === 0 &&
    (p.completedPoints || 0) === 0 &&
    taskTotal === 0 &&
    !hasBlocked &&
    !hasCarried
  ) {
    return {
      ok: false,
      reason: "not_enough_data",
      message: "Not enough sprint data to run an analysis.",
    }
  }

  if (sprintNumbers(p).some((n) => n < 0)) {
    return {
      ok: false,
      reason: "inconsistent",
      message: "Metrics contain invalid negative values.",
    }
  }

  if ((p.plannedPoints || 0) > 0 && (p.completedPoints || 0) > (p.plannedPoints || 0)) {
    return {
      ok: false,
      reason: "inconsistent",
      message: "Completed points exceed planned points.",
    }
  }

  return { ok: true }
}

/** Collect the numeric metric fields relevant to a project payload. */
function projectNumbers(p: ProjectAssistantRequest): number[] {
  return [p.totalTasks, p.doneTasks, p.blockedTasks].filter(
    (n): n is number => typeof n === "number",
  )
}

export function validateProjectPayload(p: ProjectAssistantRequest): ValidationResult {
  const hasSprints = (p.recentSprints?.length || 0) > 0

  if (!hasSprints && !p.activeSprint && (p.totalTasks || 0) === 0) {
    return {
      ok: false,
      reason: "not_enough_data",
      message: "Not enough project data to run an analysis.",
    }
  }

  if (projectNumbers(p).some((n) => n < 0)) {
    return {
      ok: false,
      reason: "inconsistent",
      message: "Metrics contain invalid negative values.",
    }
  }

  if ((p.totalTasks || 0) > 0 && (p.doneTasks || 0) > (p.totalTasks || 0)) {
    return {
      ok: false,
      reason: "inconsistent",
      message: "Completed tasks exceed total tasks.",
    }
  }

  return { ok: true }
}
