/**
 * Centralised TanStack Query key factory (design §9, Req 14).
 *
 * A single source of truth for every cache key the app uses, grouped by scope.
 * Co-locating the keys here keeps invalidation consistent: a mutation in one
 * surface (e.g. the status-mapping admin) and a read in another (e.g. a
 * `TaskCard` on a board) agree on the exact same key, so invalidation actually
 * reaches every reader.
 *
 * Every factory returns a readonly tuple so keys compare structurally and can
 * be passed straight to `useQuery`/`invalidateQueries`.
 *
 * Conventions:
 *  - Scope-prefixed: the first element names the resource family.
 *  - Parameterised by the narrowest stable id (workspaceId / projectId /
 *    taskId / boardId) so partial invalidation stays surgical.
 */
export const queryKeys = {
  /** All custom statuses for a workspace (drives every TaskCard's DisplayStyle). */
  customStatuses: (workspaceId: string) =>
    ["custom-statuses", workspaceId] as const,

  /** Active/pending members of a project. */
  projectMembers: (projectId: string) =>
    ["project-members", projectId] as const,

  /** Comments timeline for an open task (oldest-first). */
  taskComments: (taskId: string) => ["task-comments", taskId] as const,

  /** Activity timeline for an open task (newest-first). */
  taskActivity: (taskId: string) => ["task-activity", taskId] as const,

  /** Attachments list for an open task (newest-first). */
  taskAttachments: (taskId: string) => ["task-attachments", taskId] as const,

  /** A single materialised task (detail view / optimistic status updates). */
  task: (taskId: string) => ["task", taskId] as const,

  /** The task list backing a board (all columns + cards). */
  boardTasks: (boardId: string) => ["board-tasks", boardId] as const,

  /** Active/pending members of a board. */
  boardMembers: (boardId: string) => ["board-members", boardId] as const,

  /** Columns of a board (ordered by position). */
  boardColumns: (boardId: string) => ["board-columns", boardId] as const,

  /** The board details. */
  board: (boardId: string) => ["board", boardId] as const,

  /** Project details (used to derive workspaceId). */
  project: (projectId: string) => ["project", projectId] as const,

  /** Active members of a workspace. */
  workspaceMembers: (workspaceId: string) =>
    ["workspace-members", workspaceId] as const,

  /** All boards for a workspace. */
  workspaceBoards: (workspaceId: string) =>
    ["workspace-boards", workspaceId] as const,

  /** The current user's notification list. */
  notifications: () => ["notifications"] as const,

  /** The current user's unread-notification badge count. */
  notificationsUnreadCount: () => ["notifications", "unread-count"] as const,
} as const;

export type QueryKeys = typeof queryKeys;
