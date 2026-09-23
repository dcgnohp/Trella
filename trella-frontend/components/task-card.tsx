"use client";

import * as React from "react";
import { format, isPast, parseISO } from "date-fns";
import { AlertTriangle, CalendarClock, GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getTaskDisplayStyle,
  type CanonicalStatus,
  type DisplayStyle,
} from "@/lib/status/display-style";
import type { TaskPublic } from "@/lib/client";

// Explicit records (not string interpolation) so Tailwind's JIT can statically see every class.

const TITLE_DECORATION_CLASS: Record<DisplayStyle["textDecoration"], string> =
  {
    none: "",
    "line-through": "line-through",
  };

const TEXT_COLOR_CLASS: Record<string, string> = {
  foreground: "text-foreground",
  "muted-foreground": "text-muted-foreground",
  "warning-foreground": "text-warning-foreground",
  "info-foreground": "text-info-foreground",
};

// Card surface uses a light pastel tint (`/40`) to stay flat/editorial; DONE
// reuses the solid `muted` surface.
const CARD_BG_CLASS: Record<string, string> = {
  background: "",
  muted: "bg-muted",
  warning: "bg-warning/40",
  info: "bg-info/40",
};

// --- Priority indicator ---------------------------------------------------
const PRIORITY_DOT_CLASS: Record<string, string> = {
  LOW: "bg-muted-foreground/40",
  MEDIUM: "bg-info",
  HIGH: "bg-warning",
  URGENT: "bg-destructive",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export interface TaskCardAssignee {
  id: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

export interface TaskCardProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onClick"
> {
  task: TaskPublic;
  /**
   * Resolved assignee for `task.assigneeId`. Pass `null`/omit when the task is
   * unassigned. The component is presentational and never fetches it.
   */
  assignee?: TaskCardAssignee | null;
  onClick?: () => void;
  /**
   * Drag-handle props from `@hello-pangea/dnd`'s `Draggable` render prop.
   */
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null;
}

function getInitials(fullName?: string | null): string {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function isDone(style: DisplayStyle): boolean {
  return style.textDecoration === "line-through";
}

/**
 * Flat minimalist Task card. Presentational only — no data fetching.
 * Forwards `ref` and arbitrary div props for use as a `@hello-pangea/dnd` Draggable child.
 */
export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  (
    {
      task,
      assignee,
      onClick,
      dragHandleProps,
      className,
      style: inlineStyle,
      ...rest
    },
    ref,
  ) => {
    const customStatus = task.customStatus ?? null;
    const displayStyle = getTaskDisplayStyle(
      customStatus
        ? {
            canonical_status:
              (customStatus.canonicalStatus as CanonicalStatus | null) ?? null,
          }
        : null,
    );

    const done = isDone(displayStyle);

    // Custom color → left border accent. Does NOT override the DONE
    // strikethrough/gray styling — the accent only touches the left border.
    const accentColor = customStatus?.color ?? null;
    const borderStyle: React.CSSProperties | undefined = accentColor
      ? { borderLeftColor: accentColor }
      : undefined;

    const dueDate = task.dueDate ? parseISO(task.dueDate) : null;
    // Done tasks are never flagged overdue.
    const overdue = dueDate ? isPast(dueDate) && !done : false;

    const priority = task.priority?.toUpperCase?.() ?? "";
    const priorityDot = PRIORITY_DOT_CLASS[priority];
    const priorityLabel = PRIORITY_LABEL[priority] ?? task.priority;

    const interactive = typeof onClick === "function";

    return (
      <div
        ref={ref}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        style={{ ...borderStyle, ...inlineStyle }}
        className={cn(
          "group relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm",
          "transition-all",
          CARD_BG_CLASS[displayStyle.backgroundColorToken],
          // Custom-color left accent.
          accentColor && "border-l-4",
          interactive &&
            "cursor-pointer hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...rest}
      >
        {/* Header: title + drag handle */}
        <div className="flex items-start gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 break-words font-medium leading-snug",
              TITLE_DECORATION_CLASS[displayStyle.textDecoration],
              TEXT_COLOR_CLASS[displayStyle.textColorToken] ??
                "text-foreground",
            )}
          >
            {task.title}
          </p>
          {dragHandleProps ? (
            <div
              {...dragHandleProps}
              aria-label="Drag task"
              className="-mr-1 -mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" strokeWidth={1.5} />
            </div>
          ) : null}
        </div>

        {/* Status badge — shows the user's label, never the canonical value */}
        {customStatus ? (
          <div>
            <Badge variant={displayStyle.badgeVariant}>
              {customStatus.name}
            </Badge>
          </div>
        ) : null}

        {/* Footer: priority, due date, assignee */}
        <div className="flex items-center gap-3">
          {priority ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  priorityDot ?? "bg-muted-foreground/40",
                )}
                aria-hidden="true"
              />
              {priorityLabel}
            </span>
          ) : null}

          {dueDate ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs tabular-nums",
                overdue ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {overdue ? (
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
              {format(dueDate, "MMM d")}
              {overdue ? <span className="font-medium">· Overdue</span> : null}
            </span>
          ) : null}

          {task.assigneeId ? (
            <div className="ml-auto">
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Avatar className="h-6 w-6 rounded-md">
                      {assignee?.avatarUrl ? (
                        <AvatarImage
                          src={assignee.avatarUrl}
                          alt={assignee.fullName ?? "Assignee"}
                          className="rounded-md"
                        />
                      ) : null}
                      <AvatarFallback className="rounded-md text-[10px] font-medium">
                        {getInitials(assignee?.fullName)}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {assignee?.fullName ?? "Deleted User"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);

TaskCard.displayName = "TaskCard";

/**
 * Loading placeholder matching the {@link TaskCard} shape.
 */
export function TaskCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3",
        className,
      )}
      aria-hidden="true"
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-5 w-20 rounded-full" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="ml-auto h-6 w-6 rounded-md" />
      </div>
    </div>
  );
}
