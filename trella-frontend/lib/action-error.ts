import { ApiError } from "./client";

/**
 * Translate an error thrown by the generated API client into a human-readable
 * message suitable for an action's `error` field.
 *
 * FastAPI error responses carry a `{ detail: ... }` body. `detail` is usually a
 * string (e.g. "Free tier board limit reached", "Not a member of this
 * organization") but can be an array of validation errors; both are handled.
 * Non-`ApiError` values fall back to the supplied default message.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: unknown } | undefined;
    const detail = body?.detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (first && typeof first.msg === "string") {
        return first.msg;
      }
    }
  }

  return fallback;
}
