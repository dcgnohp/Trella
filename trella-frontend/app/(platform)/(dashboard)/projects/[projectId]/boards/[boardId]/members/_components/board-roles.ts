import type { ApiError as ApiErrorType } from "@/lib/client";
import { ApiError } from "@/lib/client";

export const BOARD_ROLES = [
  "BOARD_ADMIN",
  "BOARD_MEMBER",
  "BOARD_VIEWER",
] as const;

export type BoardRole = (typeof BOARD_ROLES)[number];

export const BOARD_ROLE_LABELS: Record<BoardRole, string> = {
  BOARD_ADMIN: "Admin",
  BOARD_MEMBER: "Member",
  BOARD_VIEWER: "Viewer",
};

export function isBoardRole(value: string): value is BoardRole {
  return (BOARD_ROLES as readonly string[]).includes(value);
}

export function roleLabel(value: string): string {
  return isBoardRole(value) ? BOARD_ROLE_LABELS[value] : value;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = (error as ApiErrorType).body as
      | { detail?: string | Array<{ msg?: string }> }
      | undefined;
    const detail = body?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg as string;
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function initialsFor(
  name: string | null | undefined,
  email: string,
): string {
  const source = (name && name.trim()) || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
