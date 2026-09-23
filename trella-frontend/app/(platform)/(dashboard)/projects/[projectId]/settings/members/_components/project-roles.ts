/**
 * Project-role constants + helpers for the Project Members admin screen
 * (Req 12.3). These mirror `app.models.enums.ProjectRole` on the backend and
 * are the single source of truth for the role `<Select>` options.
 */
import { ApiError } from "@/lib/client";

/** The three project roles, in privilege order (highest first). */
export const PROJECT_ROLES = [
  "PROJECT_ADMIN",
  "PROJECT_MEMBER",
  "PROJECT_VIEWER",
] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Human-friendly labels for each role. */
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  PROJECT_ADMIN: "Admin",
  PROJECT_MEMBER: "Member",
  PROJECT_VIEWER: "Viewer",
};

/** `true` when `value` is one of the known project roles. */
export function isProjectRole(value: string): value is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(value);
}

/** Render a role value as a label, falling back to the raw value. */
export function roleLabel(value: string): string {
  return isProjectRole(value) ? PROJECT_ROLE_LABELS[value] : value;
}

/**
 * Extract a user-facing message from a failed API call. FastAPI returns errors
 * as `{ detail: string }` (or `{ detail: [{ msg }] }` for validation), which
 * `ApiError.body` carries through verbatim.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as
      | { detail?: string | Array<{ msg?: string }> }
      | undefined;
    const detail = body?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail) && detail[0]?.msg) {
      return detail[0].msg as string;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/** Initials for an avatar fallback, derived from a name or email. */
export function initialsFor(
  name: string | null | undefined,
  email: string,
): string {
  const source = (name && name.trim()) || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
