export const LAST_VISITED_COOKIE = "last_visited"

/** 30 days in seconds. */
const LAST_VISITED_MAX_AGE = 60 * 60 * 24 * 30

/** Parses a "workspaceId:boardId" cookie value. */
export function parseLastVisited(
  value: string | undefined | null,
): { workspaceId: string; boardId: string } | null {
  if (!value) return null
  const [workspaceId, boardId] = value.split(":")
  if (!workspaceId || !boardId) return null
  return { workspaceId, boardId }
}

/** Href to jump straight into the most recently viewed board, or the org page if none. */
export function lastVisitedHref(value: string | undefined | null): string {
  const parsed = parseLastVisited(value)
  return parsed
    ? `/workspaces/${parsed.workspaceId}/boards/${parsed.boardId}`
    : "/organization"
}

/** Client-only: persist the most recently viewed board. */
export function setLastVisitedCookie(workspaceId: string, boardId: string): void {
  if (typeof document === "undefined") return
  document.cookie = `${LAST_VISITED_COOKIE}=${workspaceId}:${boardId}; path=/; max-age=${LAST_VISITED_MAX_AGE}`
}

/** Client-only: read the raw cookie value. */
export function getLastVisitedCookie(): string | undefined {
  if (typeof document === "undefined") return undefined
  const match = document.cookie.match(new RegExp(`(?:^|; )${LAST_VISITED_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}
