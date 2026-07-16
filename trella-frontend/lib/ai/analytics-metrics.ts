import type {
  ProjectAssistantRequest,
  SprintAnalysisRequest,
} from "@/lib/client"

export interface SprintMetrics {
  completionRate: number // 0-100 whole percent
  velocity: number | null
  plannedPoints: number
  completedPoints: number
  carryOverRate: number // 0-100 whole percent
  blockedCount: number
  remainingCount: number // todo + inProgress
  totalTasks: number
  doneCount: number
}

export function computeSprintMetrics(p: SprintAnalysisRequest): SprintMetrics {
  const plannedPoints = p.plannedPoints || 0
  const completedPoints = p.completedPoints || 0
  const todoCount = p.todoCount || 0
  const inProgressCount = p.inProgressCount || 0
  const doneCount = p.doneCount || 0
  const totalTasks = todoCount + inProgressCount + doneCount

  let completionRate = 0
  if (plannedPoints > 0) {
    completionRate = Math.round((completedPoints / plannedPoints) * 100)
  } else if (totalTasks > 0) {
    completionRate = Math.round((doneCount / totalTasks) * 100)
  }

  const carriedOver = p.carriedOverTasks?.length || 0
  const carryOverRate = totalTasks > 0 ? Math.round((carriedOver / totalTasks) * 100) : 0

  return {
    completionRate,
    velocity: typeof p.velocity === "number" ? p.velocity : null,
    plannedPoints,
    completedPoints,
    carryOverRate,
    blockedCount: p.blockedTasks?.length || 0,
    remainingCount: todoCount + inProgressCount,
    totalTasks,
    doneCount,
  }
}

export interface ProjectMetrics {
  doneRate: number
  totalTasks: number
  doneTasks: number
  blockedTasks: number
  sprintCount: number
}

export function computeProjectMetrics(p: ProjectAssistantRequest): ProjectMetrics {
  const totalTasks = p.totalTasks || 0
  const doneTasks = p.doneTasks || 0
  const doneRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return {
    doneRate,
    totalTasks,
    doneTasks,
    blockedTasks: p.blockedTasks || 0,
    sprintCount: p.recentSprints?.length || 0,
  }
}
