/**
 * Realtime (WebSocket) availability gate (design §7 "WebSocket Events",
 * Req 13.9, 19.10).
 *
 * The realtime layer is OPTIONAL — "where available". The backend may not
 * expose a WebSocket endpoint yet, so every realtime feature is gated behind a
 * single build-time config value. When the gate is closed the client no-ops
 * cleanly and the app falls back to TanStack Query's refetch-on-focus /
 * optimistic updates, which keep every cached view fresh without a socket.
 *
 * Enable realtime by setting `NEXT_PUBLIC_REALTIME_URL` to the WebSocket origin
 * of the backend, e.g.:
 *
 *   NEXT_PUBLIC_REALTIME_URL=ws://localhost:8000
 *
 * Leaving it unset (the default) disables realtime entirely.
 */

/** Raw configured WebSocket origin, or empty when realtime is disabled. */
function rawRealtimeUrl(): string {
  // Referenced as a literal member expression so Next.js can statically inline
  // the `NEXT_PUBLIC_` value at build time; read per-call so it stays testable.
  return process.env.NEXT_PUBLIC_REALTIME_URL ?? "";
}

/** Strip a single trailing slash so path joins stay clean. */
function normaliseOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/**
 * True when a WebSocket origin is configured AND we're running in a browser
 * (WebSocket is unavailable during SSR). Pure/synchronous so it can gate hook
 * effects without side effects.
 */
export function isRealtimeEnabled(): boolean {
  if (rawRealtimeUrl().trim().length === 0) {
    return false;
  }
  return typeof window !== "undefined" && typeof WebSocket !== "undefined";
}

/**
 * Build a fully-qualified WebSocket URL for `path` (which must start with `/`),
 * or `null` when realtime is disabled. An optional `token` is appended as a
 * query parameter for handshake auth (design §7 "Authentication"); when omitted
 * the browser still forwards same-site cookies during the upgrade request.
 */
export function buildRealtimeUrl(
  path: string,
  token?: string | null,
): string | null {
  const raw = rawRealtimeUrl().trim();
  if (raw.length === 0) {
    return null;
  }
  const origin = normaliseOrigin(raw);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = `${origin}${suffix}`;
  if (token) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }
  return url;
}
