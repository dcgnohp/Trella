"use client";

import * as React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import { ActivityLogsService, type ActivityLogPublic } from "@/lib/client";
import { Skeleton } from "@/components/ui/skeleton";

import {
  describeActionTarget,
  humanizeAction,
  shortActor,
  taskActivityKey,
} from "./shared";

interface ActivityTabProps {
  taskId: string;
  /**
   * Whether this tab is currently the active one. Used to refetch the timeline
   * each time the user focuses the Activity tab (Req 13.8).
   */
  active: boolean;
  /**
   * Optional `actorId -> full name` lookup so the timeline can show real names
   * (Req 13.7). The task activity endpoint only carries `actorId`, so the
   * parent (which already has the project's members) can supply this; absent a
   * match we fall back to a short mono actor token.
   */
  actorNames?: Record<string, string>;
}

/**
 * Activity tab of the TaskDetailModal (Req 13.1, 13.7, 13.8).
 *
 * Renders a vertical timeline of the task's activity (newest first). Each row
 * reads `{actor} {human action} {target} · {relative time}` with the actor and
 * any diff shown in a monospace face. The query refetches whenever the user
 * switches back to this tab (refetch on tab focus, Req 13.8).
 */
export function ActivityTab({ taskId, active, actorNames }: ActivityTabProps) {
  const {
    data: logs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: taskActivityKey(taskId),
    queryFn: () =>
      ActivityLogsService.ActivityLogs_activityLogsListTaskActivity({
        taskId,
        limit: 200,
      }),
  });

  // Refetch each time the tab becomes active (Req 13.8).
  React.useEffect(() => {
    if (active) {
      void refetch();
    }
  }, [active, refetch]);

  if (isLoading) return <ActivitySkeleton />;

  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Couldn&apos;t load activity. Try reopening the task.
      </p>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No activity yet
      </p>
    );
  }

  return (
    <ol className="max-h-[44vh] space-y-0 overflow-y-auto pr-1">
      {logs.map((log, index) => (
        <ActivityRow
          key={log.id}
          log={log}
          isLast={index === logs.length - 1}
          actorNames={actorNames}
        />
      ))}
    </ol>
  );
}

interface ActivityRowProps {
  log: ActivityLogPublic;
  isLast: boolean;
  actorNames?: Record<string, string>;
}

function ActivityRow({ log, isLast, actorNames }: ActivityRowProps) {
  const actor = actorNames?.[log.actorId] ?? shortActor(log.actorId);
  const phrase = humanizeAction(log.action);
  const target = describeActionTarget(log.action, log.oldValue, log.newValue);
  const when = safeRelativeTime(log.createdAt);

  return (
    <li className="relative flex gap-3 pb-5">
      {/* Timeline rail + node. */}
      <div className="flex flex-col items-center">
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"
          aria-hidden="true"
        />
        {!isLast ? (
          <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm leading-snug text-foreground/90">
          <span className="font-mono text-xs font-medium text-foreground">
            {actor}
          </span>{" "}
          {phrase}
          {target ? (
            <>
              {" "}
              <span className="font-mono text-xs text-muted-foreground">
                {target}
              </span>
            </>
          ) : null}
        </p>
        {when ? (
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {when}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Skeleton className="mt-1.5 h-2 w-2 rounded-full" />
            {i < 3 ? <Skeleton className="mt-1 h-8 w-px" /> : null}
          </div>
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function safeRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
