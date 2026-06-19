import type { CanonicalStatus } from "@/lib/client";

export type { CanonicalStatus };

export interface DisplayStyle {
  textDecoration: "none" | "line-through";
  textColorToken: string;
  backgroundColorToken: string;
  badgeVariant: "secondary" | "warning" | "info" | "outline";
}

// Default for null/unmapped status
const DEFAULT_STYLE: DisplayStyle = {
  textDecoration: "none",
  textColorToken: "foreground",
  backgroundColorToken: "background",
  badgeVariant: "outline",
};

const STYLE_BY_CANONICAL: Record<CanonicalStatus, DisplayStyle> = {
  DONE: {
    textDecoration: "line-through",
    textColorToken: "muted-foreground",
    backgroundColorToken: "muted",
    badgeVariant: "secondary",
  },
  PENDING: {
    textDecoration: "none",
    textColorToken: "warning-foreground",
    backgroundColorToken: "warning",
    badgeVariant: "warning",
  },
  IN_PROGRESS: {
    textDecoration: "none",
    textColorToken: "info-foreground",
    backgroundColorToken: "info",
    badgeVariant: "info",
  },
  TODO: { ...DEFAULT_STYLE },
};

export function getTaskDisplayStyle(
  customStatus: { canonical_status: CanonicalStatus | string | null } | null,
): DisplayStyle {
  if (!customStatus || customStatus.canonical_status == null) return DEFAULT_STYLE;
  const key = String(customStatus.canonical_status).toUpperCase() as CanonicalStatus;
  return STYLE_BY_CANONICAL[key] || DEFAULT_STYLE;
}
