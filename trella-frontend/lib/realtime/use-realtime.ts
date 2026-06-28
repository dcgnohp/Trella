"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { buildRealtimeUrl, isRealtimeEnabled } from "./config";
import {
  parseRealtimeEvent,
  taskIdOf,
  type RealtimeEvent,
} from "./events";

/**
 * Realtime wiring (design §7, Req 13.9, 19.10).
 *
 * These hooks subscribe to the backend WebSocket *where available* and convert
 * incoming events into TanStack cache invalidations so open views update
 * without a reload. When no WebSocket origin is configured (see
 * `lib/realtime/config.ts`) every hook is an inert no-op: it opens no socket,
 * registers no listeners, and leaves the app relying on refetch-on-focus +
 * optimistic updates as the fallback.
 */

/** Tunables for the low-level channel. */
const RECONNECT_DELAY_MS = 3000;

/**
 * Fetch the backend JWT from our server route so the browser can authenticate
 * the WS handshake. Cached at module scope so concurrent channels share one
 * request; returns null when unauthenticated.
 */
let cachedTokenPromise: Promise<string | null> | null = null;

async function fetchRealtimeToken(): Promise<string | null> {
  if (!cachedTokenPromise) {
    cachedTokenPromise = fetch("/api/realtime-token", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { token: null }))
      .then((data: { token?: string | null }) => data.token ?? null)
      .catch(() => null);
  }
  return cachedTokenPromise;
}

interface UseRealtimeChannelOptions {
  /** Path beginning with `/`, e.g. `/ws/projects/{projectId}`. */
  path: string | null;
  /** Master switch; the channel only connects when this is true. */
  enabled: boolean;
  /** Called for every successfully-parsed event frame. */
  onEvent: (event: RealtimeEvent) => void;
}

/**
 * Low-level WebSocket channel with auth + auto-reconnect. Cleans up fully on
 * unmount or when `enabled`/`path` change. No-ops when realtime is disabled or
 * the path is null.
 */
export function useRealtimeChannel({
  path,
  enabled,
  onEvent,
}: UseRealtimeChannelOptions): void {
  // Keep the latest handler without re-opening the socket on every render.
  const onEventRef = React.useRef(onEvent);
  React.useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    if (!enabled || !path || !isRealtimeEnabled()) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = async () => {
      if (disposed) return;

      const token = await fetchRealtimeToken();
      if (disposed) return;

      const url = buildRealtimeUrl(path, token);
      if (!url) return;

      try {
        socket = new WebSocket(url);
      } catch {
        // Construction can throw on a malformed URL — retry later.
        scheduleReconnect();
        return;
      }

      socket.onmessage = (message: MessageEvent) => {
        const parsed = parseRealtimeEvent(message.data);
        if (parsed) onEventRef.current(parsed);
      };

      socket.onclose = () => {
        if (!disposed) scheduleReconnect();
      };

      socket.onerror = () => {
        // Let `onclose` drive the reconnect; just close defensively.
        socket?.close();
      };
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, RECONNECT_DELAY_MS);
    };

    void connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }, [enabled, path]);
}

interface UseTaskRealtimeOptions {
  /** The open task to subscribe for. When null the hook is idle. */
  taskId: string | null | undefined;
  /** Project that owns the task — the WebSocket is project-scoped (§7). */
  projectId: string | null | undefined;
}

/**
 * Subscribe to the open task's collaboration events (Req 13.9):
 *  - `task.updated`        → refresh the task + its activity
 *  - `comment.created`     → refresh the comments timeline + activity
 *  - `attachment.uploaded` → refresh the attachments list + activity
 *
 * Only events carrying the matching `task_id` are acted on. No-ops when
 * realtime is unavailable; the modal's per-tab refetch-on-focus is the fallback.
 */
export function useTaskRealtime({
  taskId,
  projectId,
}: UseTaskRealtimeOptions): void {
  const queryClient = useQueryClient();
  const enabled = Boolean(taskId && projectId) && isRealtimeEnabled();
  const path = projectId ? `/ws/projects/${projectId}` : null;

  const onEvent = React.useCallback(
    (event: RealtimeEvent) => {
      if (!taskId) return;
      // Ignore events for other tasks on the same project channel.
      if (taskIdOf(event) !== taskId) return;

      switch (event.event) {
        case "task.updated":
        case "task.moved":
          queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
          queryClient.invalidateQueries({
            queryKey: queryKeys.taskActivity(taskId),
          });
          break;
        case "comment.created":
          queryClient.invalidateQueries({
            queryKey: queryKeys.taskComments(taskId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.taskActivity(taskId),
          });
          break;
        case "attachment.uploaded":
          queryClient.invalidateQueries({
            queryKey: queryKeys.taskAttachments(taskId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.taskActivity(taskId),
          });
          break;
        default:
          break;
      }
    },
    [queryClient, taskId],
  );

  useRealtimeChannel({ path, enabled, onEvent });
}

/**
 * Subscribe to the current user's `notification.created` events (Req 19.10):
 * bump the unread-count badge + notification list without a reload. No-ops when
 * realtime is unavailable; the notification center's refetch-on-focus is the
 * fallback.
 *
 * `notification.created` is user-scoped (§7); when a dedicated user channel is
 * not configured this stays a no-op rather than guessing a project channel.
 */
export function useNotificationsRealtime(): void {
  const queryClient = useQueryClient();
  const enabled = isRealtimeEnabled();

  const onEvent = React.useCallback(
    (event: RealtimeEvent) => {
      if (event.event !== "notification.created") return;
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notificationsUnreadCount(),
      });
    },
    [queryClient],
  );

  useRealtimeChannel({ path: "/ws/notifications", enabled, onEvent });
}

interface UseBoardRealtimeOptions {
  /** Project that owns the board — the WebSocket is project-scoped (§7). */
  projectId: string | null | undefined;
  /** Board whose task list should refresh on task events. */
  boardId: string | null | undefined;
}

/**
 * Subscribe a kanban board to project-scoped task events so cards appear,
 * move, and update live without a reload. Any `task.*` event on the project
 * channel invalidates the board's task list. No-ops when realtime is
 * unavailable; refetch-on-focus is the fallback.
 */
export function useBoardRealtime({
  projectId,
  boardId,
}: UseBoardRealtimeOptions): void {
  const queryClient = useQueryClient();
  const enabled = Boolean(projectId && boardId) && isRealtimeEnabled();
  const path = projectId ? `/ws/projects/${projectId}` : null;

  const onEvent = React.useCallback(
    (event: RealtimeEvent) => {
      if (!boardId) return;
      switch (event.event) {
        case "task.created":
        case "task.updated":
        case "task.moved":
          queryClient.invalidateQueries({
            queryKey: queryKeys.boardTasks(boardId),
          });
          break;
        default:
          break;
      }
    },
    [queryClient, boardId],
  );

  useRealtimeChannel({ path, enabled, onEvent });
}
