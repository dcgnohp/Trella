'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PlansService,
  WorkspaceMembersService,
  CustomStatusesService,
  type TaskPublic,
} from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { usePlanStaging } from '../../_hooks/use-plan-staging';
import dynamic from 'next/dynamic';
import { Save, RotateCcw, AlertCircle } from 'lucide-react';

const TaskDetailDrawer = dynamic(
  () => import('@/components/task-detail-drawer').then(m => ({ default: m.TaskDetailDrawer })),
  { ssr: false }
);
const GanttChart = dynamic(
  () => import('./gantt-chart').then(m => ({ default: m.GanttChart })),
  { ssr: false }
);

interface PlanTimelineClientProps {
  planId: string;
  workspaceId: string;
}

export function PlanTimelineClient({ planId, workspaceId }: PlanTimelineClientProps) {
  const queryClient = useQueryClient();
  const { stageChange, getEffectiveTask, stagedCount, saveAll, discardAll, isSaving } = usePlanStaging();
  const [selectedTask, setSelectedTask] = useState<TaskPublic | null>(null);

  // Queries
  const epicsQuery = useQuery({
    queryKey: queryKeys.planEpics(planId),
    queryFn: () => PlansService.Plans_plansListEpicsForPlan({ planId }),
  });
  const rawEpics = useMemo(() => (epicsQuery.data ?? []) as unknown as TaskPublic[], [epicsQuery.data]);
  
  // Apply staging overlay so chart reflects unsaved edits immediately
  const epics = useMemo(() => rawEpics.map(getEffectiveTask), [rawEpics, getEffectiveTask]);

  const workspaceMembersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId }),
  });
  const workspaceMembers = useMemo(() => workspaceMembersQuery.data ?? [], [workspaceMembersQuery.data]);

  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId }),
  });
  const statuses = customStatusesQuery.data ?? [];

  const projectMembers = useMemo(() => {
    return workspaceMembers.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.email,
      fullName: m.fullName || null,
      avatarUrl: null,
      projectRole: m.role,
      status: m.status,
    }));
  }, [workspaceMembers]);

  // Stage date & storyPoints changes against plan staging hook
  const handleEpicDateChange = (epicId: string, updates: { startDate: string; dueDate: string; storyPoints?: number }) => {
    const task = rawEpics.find(t => t.id === epicId);
    if (task) {
      stageChange(task, {
        startDate: updates.startDate,
        dueDate: updates.dueDate,
        ...(updates.storyPoints !== undefined ? { storyPoint: updates.storyPoints, storyPoints: updates.storyPoints } : {}),
      } as any);
    }
  };

  // Convert tasks for Gantt chart with overlayed effective dates & DB storyPoints
  const ganttEpics = useMemo(() => {
    return epics.map(e => {
      const statusObj = statuses.find(s => s.id === e.customStatusId) || (e as any).customStatus;
      const assigneeObj = workspaceMembers.find(m => m.userId === e.assigneeId);
      const sp = (e as any).storyPoint ?? (e as any).storyPoints ?? null;

      const resolvedStatus = statusObj
        ? { id: statusObj.id, name: statusObj.name, canonicalStatus: (statusObj as any).canonicalStatus || 'TO_DO' }
        : { id: e.customStatusId || 'to-do', name: 'To Do', canonicalStatus: 'TO_DO' };

      return {
        id: e.id,
        title: e.title,
        startDate: e.startDate,
        dueDate: e.dueDate,
        type: e.type,
        issueKey: e.issueKey || `TSK-${e.position}`,
        priority: e.priority,
        storyPoint: sp,
        storyPoints: sp,
        assigneeName: assigneeObj ? assigneeObj.fullName || assigneeObj.email : 'Phong Duc',
        customStatusId: e.customStatusId,
        customStatus: resolvedStatus,
      };
    });
  }, [epics, statuses, workspaceMembers]);

  // Effective selected task (live staged preview in TaskDetailDrawer with attached status)
  const effectiveSelectedTask = useMemo(() => {
    if (!selectedTask) return null;
    const effective = getEffectiveTask(selectedTask);
    const statusObj = statuses.find(s => s.id === effective.customStatusId) || (effective as any).customStatus;
    if (statusObj) {
      return {
        ...effective,
        customStatus: {
          id: statusObj.id,
          name: statusObj.name,
          canonicalStatus: (statusObj as any).canonicalStatus || 'TO_DO',
          color: (statusObj as any).color,
        },
      };
    }
    return effective;
  }, [selectedTask, getEffectiveTask, statuses]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--trella-surface, #FFFFFF)' }}>
      
      {/* 1. Yellow Staging Banner for Unsaved Changes */}
      {stagedCount > 0 && (
        <div style={{ padding: '10px 24px', backgroundColor: '#FEF3C7', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#92400E', fontWeight: 600, flexShrink: 0, animation: 'fadeScaleIn 160ms ease-out forwards' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} color="#D97706" />
            <span>You have <strong>{stagedCount} unsaved change{stagedCount > 1 ? 's' : ''}</strong> in this plan (duration/dates/points staged).</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={discardAll}
              disabled={isSaving}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: '#FFFFFF',
                color: '#78350F',
                border: '1px solid #FCD34D',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'background 120ms ease',
              }}
            >
              <RotateCcw size={13} /> Discard all
            </button>

            <button
              onClick={saveAll}
              disabled={isSaving}
              style={{
                padding: '5px 14px',
                fontSize: 12,
                fontWeight: 700,
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 1px 3px rgba(37,99,235,0.2)',
                transition: 'background 120ms ease',
              }}
            >
              <Save size={13} /> {isSaving ? 'Saving changes...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* 2. Gantt Chart Component */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <GanttChart
          epics={ganttEpics as any}
          onEpicDateChange={handleEpicDateChange}
          onSelectTask={(task) => {
            const raw = rawEpics.find(t => t.id === task.id);
            if (raw) setSelectedTask(raw);
          }}
          onDeleteTask={(taskId) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.planEpics(planId) });
          }}
        />
      </div>

      {/* 3. Task detail drawer with Live Staged Preview Overlay */}
      <TaskDetailDrawer
        open={!!effectiveSelectedTask}
        onClose={() => {
          setSelectedTask(null);
          queryClient.invalidateQueries({ queryKey: queryKeys.planEpics(planId) });
        }}
        task={effectiveSelectedTask}
        workspaceId={workspaceId}
        projectMembers={projectMembers}
      />

    </div>
  );
}
