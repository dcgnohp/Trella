import type { Citation } from "@/lib/ai/use-chat"

/**
 * Pure route builder for a citation. Routing-by-type lives here so it can be
 * unit-tested without a router/DOM. ponytail: string builder only — the caller
 * already hands us a well-formed Citation from the SSE parser, so no extra
 * validation. Upgrade path: a URL-driven global preview drawer for documents.
 */
export function citationRoute(c: Citation): string {
  switch (c.type) {
    case "task":
      return c.boardId
        ? `/workspaces/${c.workspaceId}/boards/${c.boardId}?task=${c.id}`
        : `/workspaces/${c.workspaceId}/backlog?task=${c.id}`
    case "sprint":
      return `/workspaces/${c.workspaceId}/backlog`
    case "document":
    default:
      return `/workspaces/${c.workspaceId}/docs/${c.id}`
  }
}
