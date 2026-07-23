/**
 * Sprint velocity calibration used by the marketing Gantt showcase.
 *
 * Trella's timeline uses a 1:1 velocity mapping: a team burns a fixed number
 * of story points per working day (default 2 pts/day = 8h/day). This converts
 * a story-point estimate into the number of whole working days it occupies on
 * the Gantt chart.
 *
 * ponytail: naive linear model (points / velocity). It ignores weekends,
 * holidays and per-member capacity. Upgrade path: feed a working-calendar and
 * per-assignee velocity when the real scheduler lands.
 */
export function pointsToWorkingDays(points: number, pointsPerDay = 2): number {
  if (!Number.isFinite(points) || points <= 0) return 0;
  if (!Number.isFinite(pointsPerDay) || pointsPerDay <= 0) return 0;
  return Math.ceil(points / pointsPerDay);
}
