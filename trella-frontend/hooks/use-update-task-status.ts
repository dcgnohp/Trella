"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  TasksService,
  type CustomStatusEmbed,
  type TaskPublic,
} from "@/lib/client";
import { queryKeys } from "@/lib/query-keys";

/**
 * `useUpdateTaskStatus` — change a task's `custom_status_id` from the UI with an
 * optimistic update + rollback (design §9, Req 14.1).
 *
 * Flow:
 *  - `onMutate` patches the cached task (and, when present, the board task list)
 *    so the `TaskCard` re-applies `getTaskDisplayStyle` instantly. The card
 *    derives its DisplayStyle from `task.customStatus`, so we swap the embedded
 *    status object too (resolved via `resolveCustomStatus`) — not just the id.
 *  - The mutation calls `PATCH /tasks/{id}` through the generated client.
 *  - `onError` rolls the cache back to the pre-mutation snapshot.
 *  - `onSettled` invalidates the task, board, and activity queries so the server
 *    truth (and any new ActivityLog entry) is reconciled.
 *
 * Relies on the denormalized `custom_status` object on `TaskPublic` (Req 14.3);
 * a `null` status resolves to the default styling via `getTaskDisplayStyle`
 * (Req 14.4).
 */
export interface UseUpdateTaskStatusOptions {
  /** The task being mutated. */
  taskId: string;
  /** Optional board whose cached task list should also be patched/invalidated. */
  boardId?: string | null;
  /**
   * Resolve the denormalized status embed for an id (typically a lookup into
   * the workspace's `custom-statuses` cache). Returning `null` clears the
   * status. When omitted, only `customStatusId` is patched optimistically.
   */
  resolveCustomStatus?: (
    customStatusId: string | null,
  ) => CustomStatusEmbed | null;
}

interface MutationContext {
  previousTask?: TaskPublic;
  previousBoard?: TaskPublic[];
}

/** Apply the new status to a single cached task. */
function patchTask(
  task: TaskPublic,
  customStatusId: string | null,
  embed: CustomStatusEmbed | null,
): TaskPublic {
  return {
    ...task,
    customStatusId,
    customStatus: embed,
  };
}

export function useUpdateTaskStatus({
  taskId,
  boardId,
  resolveCustomStatus,
}: UseUpdateTaskStatusOptions) {
  const queryClient = useQueryClient();
  const taskKey = queryKeys.task(taskId);
  const boardKey = boardId ? queryKeys.boardTasks(boardId) : null;

  return useMutation<TaskPublic, Error, string | null, MutationContext>({
    mutationFn: (customStatusId) =>
      TasksService.Tasks_tasksUpdateTask({
        taskId,
        requestBody: { customStatusId },
      }),
    onMutate: async (customStatusId) => {
      const embed = resolveCustomStatus
        ? resolveCustomStatus(customStatusId)
        : null;

      await queryClient.cancelQueries({ queryKey: taskKey });
      if (boardKey) await queryClient.cancelQueries({ queryKey: boardKey });

      const previousTask = queryClient.getQueryData<TaskPublic>(taskKey);
      const previousBoard = boardKey
        ? queryClient.getQueryData<TaskPublic[]>(boardKey)
        : undefined;

      if (previousTask) {
        queryClient.setQueryData<TaskPublic>(
          taskKey,
          patchTask(previousTask, customStatusId, embed),
        );
      }

      if (boardKey && previousBoard) {
        queryClient.setQueryData<TaskPublic[]>(
          boardKey,
          previousBoard.map((t) =>
            t.id === taskId ? patchTask(t, customStatusId, embed) : t,
          ),
        );
      }

      return { previousTask, previousBoard };
    },
    onError: (_error, _customStatusId, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(taskKey, context.previousTask);
      }
      if (boardKey && context?.previousBoard) {
        queryClient.setQueryData(boardKey, context.previousBoard);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: taskKey });
      if (boardKey) queryClient.invalidateQueries({ queryKey: boardKey });
      queryClient.invalidateQueries({
        queryKey: queryKeys.taskActivity(taskId),
      });
    },
  });
}
