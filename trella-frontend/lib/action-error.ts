import { ApiError } from "./client";

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
