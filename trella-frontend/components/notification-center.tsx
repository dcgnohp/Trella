"use client";

import { Bell, Check, CheckCheck } from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  BoardMembersService,
  NotificationsService,
  ProjectMembersService,
  WorkspaceMembersService,
  type NotificationPublic,
  type UnreadCountPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";
import { useNotificationsRealtime } from "@/lib/realtime/use-realtime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * In-app notification center (Requirements 19.4, 19.5, 19.6, 19.7, 19.12).
 *
 * A bell trigger in the dashboard top bar opens a popover that lists the
 * current user's notifications newest-first, grouped by relative time. An
 * unread badge mirrors `GET /me/notifications/unread-count`; clicking an item
 * (or its mark-read control) calls `PATCH /me/notifications/{id}/read` and the
 * "Mark all as read" button calls `POST /me/notifications/read-all`. Both
 * mutations optimistically update the cached unread count so the badge reacts
 * instantly.
 *
 * Data fetching uses TanStack Query with two query keys:
 *  - `NOTIFICATIONS_KEY`        -> the notification list
 *  - `UNREAD_COUNT_KEY`         -> the unread badge count
 *
 * Realtime (task 25.2 — Req 19.10): when a WebSocket origin is configured
 * (`NEXT_PUBLIC_REALTIME_URL`), `useNotificationsRealtime()` subscribes to
 * `notification.created` and invalidates both keys so the badge bumps without a
 * reload. When realtime is unavailable the hook no-ops and refetch-on-focus
 * keeps the badge fresh as the fallback.
 */

/**
 * Stable TanStack keys for the notification surfaces. Sourced from the shared
 * `queryKeys` factory (design §9) so the realtime layer and any other reader
 * invalidate the exact same buckets. Re-exported for callers that import them.
 */
export const NOTIFICATIONS_KEY = queryKeys.notifications();
export const UNREAD_COUNT_KEY = queryKeys.notificationsUnreadCount();

type TimeGroup = {
  label: string;
  items: NotificationPublic[];
};

/** Bucket notifications (already newest-first) into Today / Yesterday / Earlier. */
function groupByRelativeTime(items: NotificationPublic[]): TimeGroup[] {
  const today: NotificationPublic[] = [];
  const yesterday: NotificationPublic[] = [];
  const earlier: NotificationPublic[] = [];

  for (const item of items) {
    const date = new Date(item.createdAt);
    if (isToday(date)) {
      today.push(item);
    } else if (isYesterday(date)) {
      yesterday.push(item);
    } else {
      earlier.push(item);
    }
  }

  return [
    { label: "Today", items: today },
    { label: "Yesterday", items: yesterday },
    { label: "Earlier", items: earlier },
  ].filter((group) => group.items.length > 0);
}

interface NotificationRowProps {
  notification: NotificationPublic;
  onMarkRead: (id: string) => void;
  isMarking: boolean;
}

const INVITATION_TYPES = new Set([
  "WORKSPACE_INVITATION",
  "PROJECT_INVITATION",
  "BOARD_INVITATION",
]);

function InvitationActions({
  notification,
  onMarkRead,
}: {
  notification: NotificationPublic;
  onMarkRead: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const meta = notification.metadata as Record<string, string> | null | undefined;

  const accept = useMutation({
    mutationFn: async () => {
      if (notification.type === "WORKSPACE_INVITATION") {
        const workspaceId = meta?.workspace_id ?? "";
        await WorkspaceMembersService.WorkspaceMembers_workspaceMembersAcceptInvitation(
          { workspaceId },
        );
      } else if (notification.type === "PROJECT_INVITATION") {
        const projectId = meta?.project_id ?? "";
        await ProjectMembersService.ProjectMembers_projectMembersAcceptInvitation(
          { projectId },
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectMembers(projectId),
        });
      } else if (notification.type === "BOARD_INVITATION") {
        const boardId = meta?.board_id ?? "";
        await BoardMembersService.BoardMembers_boardMembersAcceptInvitation(
          { boardId },
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.boardMembers(boardId),
        });
      }
    },
    onSuccess: () => {
      toast.success("Invitation accepted");
      onMarkRead(notification.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
    onError: () => toast.error("Failed to accept invitation"),
  });

  const decline = useMutation({
    mutationFn: async () => {
      if (notification.type === "WORKSPACE_INVITATION") {
        const workspaceId = meta?.workspace_id ?? "";
        await WorkspaceMembersService.WorkspaceMembers_workspaceMembersDeclineInvitation(
          { workspaceId },
        );
      } else if (notification.type === "PROJECT_INVITATION") {
        const projectId = meta?.project_id ?? "";
        await ProjectMembersService.ProjectMembers_projectMembersDeclineInvitation(
          { projectId },
        );
      } else if (notification.type === "BOARD_INVITATION") {
        const boardId = meta?.board_id ?? "";
        await BoardMembersService.BoardMembers_boardMembersDeclineInvitation(
          { boardId },
        );
      }
    },
    onSuccess: () => {
      toast.success("Invitation declined");
      onMarkRead(notification.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
    onError: () => toast.error("Failed to decline invitation"),
  });

  const isPending = accept.isPending || decline.isPending;

  return (
    <div className="flex gap-2 pt-1">
      <Button
        size="sm"
        variant="default"
        className="h-7 px-3 text-xs"
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          accept.mutate();
        }}
      >
        {accept.isPending ? "Accepting…" : "Accept"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-3 text-xs"
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          decline.mutate();
        }}
      >
        {decline.isPending ? "Declining…" : "Decline"}
      </Button>
    </div>
  );
}

const NotificationRow = ({
  notification,
  onMarkRead,
  isMarking,
}: NotificationRowProps) => {
  const { id, title, content, isRead, createdAt, type } = notification;
  const isInvitation = INVITATION_TYPES.has(type);

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-x-3 rounded-md px-3 py-2.5 text-left transition-colors",
        isRead ? "opacity-70" : "hover:bg-muted/60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          isRead ? "bg-transparent" : "bg-primary",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-y-0.5">
        <span
          className={cn(
            "truncate text-sm",
            isRead ? "font-normal text-foreground" : "font-medium text-foreground",
          )}
        >
          {title}
        </span>
        {content ? (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {content}
          </span>
        ) : null}
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </span>
        {isInvitation && !isRead && (
          <InvitationActions notification={notification} onMarkRead={onMarkRead} />
        )}
      </span>
      {!isRead && !isInvitation ? (
        <button
          type="button"
          onClick={() => onMarkRead(id)}
          disabled={isMarking}
          aria-label="Mark as read"
          className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Check
            strokeWidth={1.5}
            className="h-4 w-4 text-muted-foreground"
          />
        </button>
      ) : null}
    </div>
  );
};

const ListSkeleton = () => (
  <div className="space-y-1 p-2" aria-hidden>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="flex items-start gap-x-3 px-3 py-2.5">
        <Skeleton className="mt-1.5 h-2 w-2 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

export const NotificationCenter = () => {
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () =>
      NotificationsService.Notifications_notificationsListNotifications({}),
  });

  const unreadCountQuery = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () =>
      NotificationsService.Notifications_notificationsGetUnreadCount(),
  });

  // ------------------------------------------------------------------ //
  // Realtime (task 25.2, Req 19.10): when a WebSocket origin is configured
  // this subscribes to `notification.created` and invalidates both the list
  // and the unread-count so the badge bumps without a reload. When realtime is
  // unavailable it is an inert no-op and the queries above keep themselves
  // fresh via refetch-on-focus.
  // ------------------------------------------------------------------ //
  useNotificationsRealtime();

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      NotificationsService.Notifications_notificationsMarkNotificationRead({
        notificationId,
      }),
    onMutate: async (notificationId: string) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY }),
        queryClient.cancelQueries({ queryKey: UNREAD_COUNT_KEY }),
      ]);

      const previousList =
        queryClient.getQueryData<NotificationPublic[]>(NOTIFICATIONS_KEY);
      const previousCount =
        queryClient.getQueryData<UnreadCountPublic>(UNREAD_COUNT_KEY);

      // Only decrement when the target was actually unread (Req 19.9: monotonic).
      const wasUnread = previousList?.some(
        (n) => n.id === notificationId && !n.isRead,
      );

      if (previousList) {
        queryClient.setQueryData<NotificationPublic[]>(
          NOTIFICATIONS_KEY,
          previousList.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
        );
      }

      if (previousCount && wasUnread) {
        queryClient.setQueryData<UnreadCountPublic>(UNREAD_COUNT_KEY, {
          unreadCount: Math.max(0, previousCount.unreadCount - 1),
        });
      }

      return { previousList, previousCount };
    },
    onError: (_err, _id, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(NOTIFICATIONS_KEY, context.previousList);
      }
      if (context?.previousCount) {
        queryClient.setQueryData(UNREAD_COUNT_KEY, context.previousCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      NotificationsService.Notifications_notificationsMarkAllNotificationsRead(),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY }),
        queryClient.cancelQueries({ queryKey: UNREAD_COUNT_KEY }),
      ]);

      const previousList =
        queryClient.getQueryData<NotificationPublic[]>(NOTIFICATIONS_KEY);
      const previousCount =
        queryClient.getQueryData<UnreadCountPublic>(UNREAD_COUNT_KEY);

      if (previousList) {
        queryClient.setQueryData<NotificationPublic[]>(
          NOTIFICATIONS_KEY,
          previousList.map((n) => ({ ...n, isRead: true })),
        );
      }
      queryClient.setQueryData<UnreadCountPublic>(UNREAD_COUNT_KEY, {
        unreadCount: 0,
      });

      return { previousList, previousCount };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(NOTIFICATIONS_KEY, context.previousList);
      }
      if (context?.previousCount) {
        queryClient.setQueryData(UNREAD_COUNT_KEY, context.previousCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });

  const unreadCount = unreadCountQuery.data?.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;
  const notifications = notificationsQuery.data ?? [];
  const groups = groupByRelativeTime(notifications);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 w-9 rounded-md p-0"
          aria-label={
            hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"
          }
        >
          <Bell className="h-5 w-5 text-neutral-600" strokeWidth={1.5} />
          {hasUnread ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto gap-x-1.5 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            disabled={!hasUnread || markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
          >
            <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
            Mark all as read
          </Button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {notificationsQuery.isLoading ? (
            <ListSkeleton />
          ) : notificationsQuery.isError ? (
            <div className="flex flex-col items-center gap-y-2 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load notifications.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-auto px-3 py-1.5 text-xs"
                onClick={() => notificationsQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-y-1 px-4 py-12 text-center">
              <Bell className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
              <p className="text-sm font-medium text-foreground">
                You&apos;re all caught up
              </p>
              <p className="text-xs text-muted-foreground">
                New notifications will show up here.
              </p>
            </div>
          ) : (
            <div className="py-1">
              {groups.map((group) => (
                <div key={group.label} className="px-2 py-1">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((notification) => (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        onMarkRead={(id) => markReadMutation.mutate(id)}
                        isMarking={markReadMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
