/**
 * Whether a task belongs on the board surface.
 *
 * Kanban has no sprints, so every task shows. Scrum boards mirror the running
 * sprint only: a task shows iff there is an ACTIVE sprint and the task is in it.
 * Backlog tasks (sprintId null) and tasks in other/planned sprints are hidden —
 * they live in the Backlog tab. When no sprint is active, the board is empty.
 */
export function isTaskVisibleOnScrumBoard(
  sprintId: string | null | undefined,
  isScrum: boolean,
  activeSprintId: string | null,
): boolean {
  if (!isScrum) return true;
  return activeSprintId != null && sprintId === activeSprintId;
}
