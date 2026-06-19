/**
 * Realtime event shapes mirroring the backend contract (design §7
 * "WebSocket Events"). Kept framework-free so the parsing/guard logic can be
 * unit-tested in isolation (node env).
 */

/** Event names the frontend reacts to today. */
export type RealtimeEventName =
  | "task.created"
  | "task.updated"
  | "task.moved"
  | "comment.created"
  | "attachment.uploaded"
  | "notification.created";

/** A task-scoped event payload (design §7). */
export interface TaskEventPayload {
  task_id: string;
  [key: string]: unknown;
}

/** A notification-scoped event payload (design §7). */
export interface NotificationEventPayload {
  notification_id: string;
  title?: string;
  [key: string]: unknown;
}

/** Discriminated wrapper for any realtime frame. */
export interface RealtimeEvent {
  event: RealtimeEventName;
  project_id?: string;
  user_id?: string;
  payload?: Record<string, unknown>;
}

const KNOWN_EVENTS: ReadonlySet<string> = new Set<RealtimeEventName>([
  "task.created",
  "task.updated",
  "task.moved",
  "comment.created",
  "attachment.uploaded",
  "notification.created",
]);

/**
 * Safely parse a raw WebSocket message into a {@link RealtimeEvent}. Returns
 * `null` for malformed frames or unknown event names so callers can ignore
 * anything they don't understand without throwing. Untrusted input — never
 * assume shape.
 */
export function parseRealtimeEvent(raw: unknown): RealtimeEvent | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!data || typeof data !== "object") return null;
  const event = (data as Record<string, unknown>).event;
  if (typeof event !== "string" || !KNOWN_EVENTS.has(event)) return null;

  const rec = data as Record<string, unknown>;
  const payload =
    rec.payload && typeof rec.payload === "object"
      ? (rec.payload as Record<string, unknown>)
      : undefined;

  return {
    event: event as RealtimeEventName,
    project_id:
      typeof rec.project_id === "string" ? rec.project_id : undefined,
    user_id: typeof rec.user_id === "string" ? rec.user_id : undefined,
    payload,
  };
}

/** Extract a `task_id` from an event payload, or `null` when absent. */
export function taskIdOf(event: RealtimeEvent): string | null {
  const id = event.payload?.task_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
