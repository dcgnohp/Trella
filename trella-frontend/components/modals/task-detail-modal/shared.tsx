import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from "lucide-react";

import { queryKeys } from "@/lib/query-keys";

/**
 * Shared helpers + constants for the TaskDetailModal tabs (design §8.5.8C,
 * Req 13). Kept framework-free so they can be unit tested in isolation.
 */

/** 25 MiB client-side upload ceiling, mirroring the backend guard (Req 5.3 / 13.5). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Mime types the backend rejects with HTTP 415 (Req 5.4). Guarded client-side
 * BEFORE the multipart request is ever issued so a forbidden file never leaves
 * the browser (Req 13.5).
 */
export const BLOCKED_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/x-msdownload",
  "application/x-sh",
  "application/x-bat",
  "application/x-msdos-program",
]);

/** Per-query TanStack key factories — sourced from the shared `queryKeys`
 * module (design §9) so reads here and realtime invalidations agree exactly. */
export const taskCommentsKey = queryKeys.taskComments;
export const taskAttachmentsKey = queryKeys.taskAttachments;
export const taskActivityKey = queryKeys.taskActivity;

/** Two-letter initials for an avatar fallback (matches TaskCard behaviour). */
export function getInitials(fullName?: string | null): string {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Human-readable file size with `tabular-nums`-friendly formatting (Req 13.4).
 * Bytes < 1 KiB render as bytes; otherwise KB / MB / GB with one decimal.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  // One decimal, but drop a trailing ".0" for whole numbers.
  const rounded = Math.round(size * 10) / 10;
  const text = Number.isInteger(rounded)
    ? rounded.toString()
    : rounded.toFixed(1);
  return `${text} ${units[unitIndex]}`;
}

/** Pick a Lucide icon for an attachment based on its mime type (Req 13.4). */
export function getFileIcon(mimeType: string): LucideIcon {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime === "application/pdf") return FileText;
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("tar") ||
    mime.includes("rar") ||
    mime.includes("7z")
  ) {
    return FileArchive;
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv"
  ) {
    return FileSpreadsheet;
  }
  if (
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("xml") ||
    mime.includes("html")
  ) {
    return FileCode;
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("document") ||
    mime.includes("word")
  ) {
    return FileText;
  }
  return File;
}

/**
 * Map an ActivityLog `action` enum (Req 6.1) to a human-readable verb phrase
 * for the timeline (Req 13.7). Unknown actions fall back to a humanized form of
 * the raw enum value so the timeline never renders a bare token.
 */
const ACTION_PHRASES: Record<string, string> = {
  TASK_CREATED: "created this task",
  TASK_UPDATED: "updated this task",
  TASK_DELETED: "deleted this task",
  TASK_MOVED: "moved this task",
  TASK_STATUS_CHANGED: "changed status",
  TASK_ASSIGNED: "assigned this task",
  TASK_UNASSIGNED: "unassigned this task",
  TASK_PRIORITY_CHANGED: "changed priority",
  TASK_DUE_DATE_CHANGED: "changed the due date",
  COMMENT_CREATED: "commented",
  COMMENT_UPDATED: "edited a comment",
  COMMENT_DELETED: "deleted a comment",
  ATTACHMENT_UPLOADED: "uploaded an attachment",
  ATTACHMENT_DELETED: "removed an attachment",
  COLUMN_CREATED: "created a column",
  COLUMN_UPDATED: "updated a column",
  COLUMN_DELETED: "deleted a column",
  COLUMN_REORDERED: "reordered columns",
  MEMBER_ADDED: "added a member",
  MEMBER_ROLE_CHANGED: "changed a member role",
  MEMBER_REMOVED: "removed a member",
  STATUS_MAPPING_CHANGED: "changed a status mapping",
};

export function humanizeAction(action: string): string {
  if (ACTION_PHRASES[action]) return ACTION_PHRASES[action];
  return action.toLowerCase().replace(/_/g, " ");
}

/**
 * Best-effort "target / diff" suffix for a timeline row. Status changes carry
 * `status_name` in their old/new snapshots (Req 6.8) which we surface as
 * `from X to Y`; everything else returns an empty string.
 */
export function describeActionTarget(
  action: string,
  oldValue?: Record<string, unknown> | null,
  newValue?: Record<string, unknown> | null,
): string {
  if (action === "TASK_STATUS_CHANGED") {
    const from = readString(oldValue, "status_name");
    const to = readString(newValue, "status_name");
    if (from && to) return `from ${from} to ${to}`;
    if (to) return `to ${to}`;
  }
  return "";
}

function readString(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!value) return null;
  const v = value[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Short, mono-friendly token for an actor when no display name is available. */
export function shortActor(actorId: string): string {
  return actorId.length > 8 ? `${actorId.slice(0, 8)}…` : actorId;
}
