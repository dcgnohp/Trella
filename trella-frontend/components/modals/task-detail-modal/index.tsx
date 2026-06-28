"use client";

import * as React from "react";

import type { TaskPublic } from "@/lib/client";
import { useTaskRealtime } from "@/lib/realtime/use-realtime";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CommentsTab } from "./comments-tab";
import { AttachmentsTab } from "./attachments-tab";
import { ActivityTab } from "./activity-tab";
import { AssigneePicker } from "./assignee-picker";

type TaskDetailTab = "comments" | "attachments" | "activity";

export interface TaskDetailModalProps {
  /** Controls dialog visibility. */
  open: boolean;
  /** Fired when the dialog requests to close (overlay click, Esc, X). */
  onOpenChange: (open: boolean) => void;
  /**
   * The task whose collaboration surface is shown. When `null` the modal renders
   * its loading shell (the parent is still resolving the task).
   */
  task: TaskPublic | null;
  /**
   * Optional `actorId -> full name` map for the Activity timeline (Req 13.7).
   * The activity endpoint only returns `actorId`; the parent board (which holds
   * the project's members) can thread real names through.
   */
  actorNames?: Record<string, string>;
  /** Initial tab. Defaults to Comments. */
  defaultTab?: TaskDetailTab;
}

/**
 * TaskDetailModal — a single crisp dialog exposing the task's collaboration
 * surface across three tabs: Comments, Attachments, Activity (Req 13.1).
 *
 * Each tab owns its own TanStack Query (per-task keys) so switching tabs never
 * reloads the whole modal, and the Activity tab refetches on focus (Req 13.8).
 */
export function TaskDetailModal({
  open,
  onOpenChange,
  task,
  actorNames,
  defaultTab = "comments",
}: TaskDetailModalProps) {
  const [tab, setTab] = React.useState<TaskDetailTab>(defaultTab);

  // Realtime (task 25.2, Req 13.9): while the modal is open, subscribe to the
  // task's collaboration events on the project channel and invalidate the
  // matching per-tab queries. No-ops when realtime is unavailable — each tab's
  // refetch-on-focus is the fallback.
  useTaskRealtime({
    taskId: open ? task?.id ?? null : null,
    projectId: open ? task?.projectId ?? null : null,
  });

  // Reset to the default tab whenever a different task is opened.
  React.useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, task?.id, defaultTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-4" onFocusOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            {task ? task.title : "Task"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Task comments, attachments and activity
          </DialogDescription>
          {task && (
            <div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
              <span className="shrink-0">Assignee:</span>
              <AssigneePicker task={task} />
            </div>
          )}
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as TaskDetailTab)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="attachments">Attachments</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            {!task ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Loading task…
              </p>
            ) : (
              <>
                <TabsContent value="comments">
                  <CommentsTab taskId={task.id} projectId={task.projectId} />
                </TabsContent>
                <TabsContent value="attachments">
                  <AttachmentsTab taskId={task.id} />
                </TabsContent>
                <TabsContent value="activity">
                  <ActivityTab
                    taskId={task.id}
                    active={tab === "activity"}
                    actorNames={actorNames}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
