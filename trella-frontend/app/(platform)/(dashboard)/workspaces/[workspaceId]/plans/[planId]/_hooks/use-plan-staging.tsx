'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TasksService, type TaskPublic, type TaskUpdate } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';

/**
 * Plan staging store.
 *
 * Jira Plans is a planning sandbox: edits made inside the plan (dragging a
 * card to a sprint, moving a timeline bar) are staged in memory and only
 * written back to the real tasks when the user clicks "Save changes". This
 * context holds those staged edits for the lifetime of the open plan.
 */

export type StagedFields = Pick<
  TaskUpdate,
  'sprintId' | 'startDate' | 'dueDate' | 'customStatusId' | 'assigneeId' | 'priority'
>;

export interface StagedChange {
  taskId: string;
  title: string;
  issueKey: string | null;
  fields: StagedFields;
  /** Snapshot of the same fields before staging, for the Current → New diff. */
  before: StagedFields;
}

interface PlanStagingContextValue {
  stagedCount: number;
  changes: StagedChange[];
  stageChange: (task: TaskPublic, fields: StagedFields) => void;
  discardChange: (taskId: string) => void;
  discardAll: () => void;
  saveAll: () => Promise<void>;
  isSaving: boolean;
  /** Overlay staged fields onto a task so UI reflects edits before save. */
  getEffectiveTask: <T extends TaskPublic>(task: T) => T;
  isStaged: (taskId: string) => boolean;
}

const PlanStagingContext = createContext<PlanStagingContextValue | null>(null);

function pickFields(task: TaskPublic, keys: (keyof StagedFields)[]): StagedFields {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = (task as Record<string, unknown>)[k] ?? null;
  }
  return out as StagedFields;
}

export function PlanStagingProvider({
  planId,
  workspaceId,
  children,
}: {
  planId: string;
  workspaceId: string;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [map, setMap] = useState<Record<string, StagedChange>>({});
  const [isSaving, setIsSaving] = useState(false);

  const stageChange = useCallback((task: TaskPublic, fields: StagedFields) => {
    setMap(prev => {
      const changedKeys = Object.keys(fields) as (keyof StagedFields)[];
      const existing = prev[task.id];
      const before = existing?.before ?? pickFields(task, changedKeys);
      const mergedFields = { ...(existing?.fields ?? {}), ...fields };

      // Drop fields that now equal their original value — nothing to save.
      const meaningful: Record<string, unknown> = {};
      let hasChange = false;
      for (const k of Object.keys(mergedFields) as (keyof StagedFields)[]) {
        const beforeVal = before[k] ?? null;
        const newVal = mergedFields[k] ?? null;
        if (beforeVal !== newVal) {
          meaningful[k] = newVal;
          hasChange = true;
        }
      }

      if (!hasChange) {
        const { [task.id]: _drop, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [task.id]: {
          taskId: task.id,
          title: task.title,
          issueKey: task.issueKey ?? null,
          fields: meaningful as StagedFields,
          before,
        },
      };
    });
  }, []);

  const discardChange = useCallback((taskId: string) => {
    setMap(prev => {
      const { [taskId]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const discardAll = useCallback(() => setMap({}), []);

  const saveAll = useCallback(async () => {
    const changes = Object.values(map);
    if (changes.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(
        changes.map(c =>
          TasksService.Tasks_tasksUpdateTask({
            taskId: c.taskId,
            requestBody: c.fields as TaskUpdate,
          })
        )
      );
      // Refresh the plan view and every surface that shows the same tasks so
      // the workspace board / backlog reflect the committed changes.
      queryClient.invalidateQueries({ queryKey: queryKeys.planEpics(planId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      queryClient.invalidateQueries({ queryKey: ['workspace-sprints', workspaceId] });
      setMap({});
      toast.success(
        `Saved ${changes.length} change${changes.length !== 1 ? 's' : ''} to your workspace`
      );
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [map, planId, workspaceId, queryClient]);

  const getEffectiveTask = useCallback(
    <T extends TaskPublic>(task: T): T => {
      const staged = map[task.id];
      if (!staged) return task;
      return { ...task, ...staged.fields } as T;
    },
    [map]
  );

  const isStaged = useCallback((taskId: string) => Boolean(map[taskId]), [map]);

  const value = useMemo<PlanStagingContextValue>(
    () => ({
      stagedCount: Object.keys(map).length,
      changes: Object.values(map),
      stageChange,
      discardChange,
      discardAll,
      saveAll,
      isSaving,
      getEffectiveTask,
      isStaged,
    }),
    [map, stageChange, discardChange, discardAll, saveAll, isSaving, getEffectiveTask, isStaged]
  );

  return <PlanStagingContext.Provider value={value}>{children}</PlanStagingContext.Provider>;
}

export function usePlanStaging(): PlanStagingContextValue {
  const ctx = useContext(PlanStagingContext);
  if (!ctx) {
    throw new Error('usePlanStaging must be used within a PlanStagingProvider');
  }
  return ctx;
}
