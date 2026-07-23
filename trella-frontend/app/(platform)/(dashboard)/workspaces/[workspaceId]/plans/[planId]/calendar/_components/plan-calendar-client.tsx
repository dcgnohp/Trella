'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isBefore,
  startOfDay,
  differenceInDays,
} from 'date-fns';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  Calendar as CalendarIcon,
  Plus,
  Clock,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';

import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import EpicIcon from '@atlaskit/icon/core/epic';
import TaskIcon from '@atlaskit/icon/core/task';

import {
  PlansService,
  WorkspaceMembersService,
  CustomStatusesService,
  type TaskPublic,
} from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { usePlanStaging } from '../../_hooks/use-plan-staging';

const TaskDetailDrawer = dynamic(
  () => import('@/components/task-detail-drawer').then(m => ({ default: m.TaskDetailDrawer })),
  { ssr: false }
);

interface PlanCalendarClientProps {
  planId: string;
  workspaceId?: string;
}

export function PlanCalendarClient({ planId, workspaceId }: PlanCalendarClientProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<'MONTH' | 'WEEK' | 'DAY'>('MONTH');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [selectedTask, setSelectedTask] = useState<TaskPublic | null>(null);

  // View Slide Animation State
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [animating, setAnimating] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Popover for "+N more"
  const [popoverDay, setPopoverDay] = useState<{ day: Date; tasks: TaskPublic[]; rect: DOMRect } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Tooltip state
  const [hoveredTask, setHoveredTask] = useState<{ task: TaskPublic; rect: DOMRect } | null>(null);

  // Staging hook
  const { getEffectiveTask } = usePlanStaging();

  // 1. Fetch Plan Epics / Tasks
  const epicsQuery = useQuery({
    queryKey: queryKeys.planEpics(planId),
    queryFn: () => PlansService.Plans_plansListEpicsForPlan({ planId }),
  });
  const rawEpics = useMemo(() => (epicsQuery.data ?? []) as unknown as TaskPublic[], [epicsQuery.data]);
  const epics = useMemo(() => rawEpics.map(getEffectiveTask), [rawEpics, getEffectiveTask]);

  // 2. Fetch Workspace Members
  const workspaceMembersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId || ''),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId: workspaceId! }),
    enabled: !!workspaceId,
  });
  const workspaceMembers = useMemo(() => workspaceMembersQuery.data ?? [], [workspaceMembersQuery.data]);

  // 3. Fetch Custom Statuses
  const customStatusesQuery = useQuery({
    queryKey: queryKeys.customStatuses(workspaceId || ''),
    queryFn: () => CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId: workspaceId! }),
    enabled: !!workspaceId,
  });
  const customStatuses = useMemo(() => customStatusesQuery.data ?? [], [customStatusesQuery.data]);

  // Project members for TaskDetailDrawer
  const projectMembers = useMemo(() => {
    return workspaceMembers.map(m => ({
      id: m.id,
      userId: m.userId,
      fullName: m.fullName || m.email,
      email: m.email,
      projectRole: 'PROJECT_MEMBER',
      status: m.status,
    }));
  }, [workspaceMembers]);

  // Filter Tasks by Search, Status, Assignee, Priority
  const filteredTasks = useMemo(() => {
    return epics.filter(task => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const titleMatch = task.title.toLowerCase().includes(q);
        const keyMatch = (task.issueKey || `TSK-${task.position}`).toLowerCase().includes(q);
        if (!titleMatch && !keyMatch) return false;
      }
      // Status
      if (statusFilter !== 'ALL') {
        const statusObj = customStatuses.find(s => s.id === task.customStatusId) || task.customStatus;
        const statusName = (statusObj?.name || '').toUpperCase();
        if (statusFilter === 'TODO' && !statusName.includes('TO DO') && !statusName.includes('BACKLOG')) return false;
        if (statusFilter === 'IN_PROGRESS' && !statusName.includes('PROGRESS')) return false;
        if (statusFilter === 'REVIEW' && !statusName.includes('REVIEW')) return false;
        if (statusFilter === 'DONE' && !statusName.includes('DONE') && !statusName.includes('COMPLETED')) return false;
        if (statusFilter === 'BLOCKED' && !statusName.includes('BLOCKED') && !statusName.includes('RISK')) return false;
      }
      // Assignee
      if (assigneeFilter !== 'ALL') {
        if (assigneeFilter === 'UNASSIGNED' && task.assigneeId) return false;
        if (assigneeFilter !== 'UNASSIGNED' && task.assigneeId !== assigneeFilter) return false;
      }
      // Priority
      if (priorityFilter !== 'ALL') {
        if (task.priority !== priorityFilter) return false;
      }
      return true;
    });
  }, [epics, searchQuery, statusFilter, assigneeFilter, priorityFilter, customStatuses]);

  // Dynamic Days In View Calculation (MONTH / WEEK / DAY)
  const { daysInView, leadingBlanks, headerTitle } = useMemo(() => {
    if (viewMode === 'WEEK') {
      const wStart = startOfWeek(currentDate);
      const wEnd = endOfWeek(currentDate);
      const days = eachDayOfInterval({ start: wStart, end: wEnd });
      return {
        daysInView: days,
        leadingBlanks: 0,
        headerTitle: `${format(wStart, 'MMM d')} – ${format(wEnd, 'MMM d, yyyy')}`,
      };
    }

    if (viewMode === 'DAY') {
      return {
        daysInView: [currentDate],
        leadingBlanks: 0,
        headerTitle: format(currentDate, 'EEEE, MMMM d, yyyy'),
      };
    }

    // Default: MONTH
    const mStart = startOfMonth(currentDate);
    const mEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: mStart, end: mEnd });
    return {
      daysInView: days,
      leadingBlanks: days.length > 0 ? days[0].getDay() : 0,
      headerTitle: format(currentDate, 'MMMM yyyy'),
    };
  }, [currentDate, viewMode]);

  const today = startOfDay(new Date());

  // Metrics Context Calculation for Subtitle
  const totalScheduled = filteredTasks.filter(t => t.dueDate || t.startDate).length;
  const overdueCount = filteredTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = startOfDay(new Date(t.dueDate));
    const statusObj = customStatuses.find(s => s.id === t.customStatusId) || t.customStatus;
    const isDone = (statusObj?.name || '').toUpperCase().includes('DONE');
    return isBefore(due, today) && !isDone;
  }).length;

  const dueThisWeekCount = filteredTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = startOfDay(new Date(t.dueDate));
    const diff = differenceInDays(due, today);
    return diff >= 0 && diff <= 7;
  }).length;

  // View navigation handlers with smooth slide animation
  const handlePrev = () => {
    setSlideDirection('left');
    setAnimating(true);
    if (viewMode === 'WEEK') setCurrentDate(d => subWeeks(d, 1));
    else if (viewMode === 'DAY') setCurrentDate(d => subDays(d, 1));
    else setCurrentDate(d => subMonths(d, 1));
    setTimeout(() => setAnimating(false), 240);
  };

  const handleNext = () => {
    setSlideDirection('right');
    setAnimating(true);
    if (viewMode === 'WEEK') setCurrentDate(d => addWeeks(d, 1));
    else if (viewMode === 'DAY') setCurrentDate(d => addDays(d, 1));
    else setCurrentDate(d => addMonths(d, 1));
    setTimeout(() => setAnimating(false), 240);
  };

  const handleTodayClick = () => {
    setSlideDirection(null);
    setCurrentDate(new Date());
    setAnimating(true);
    setTimeout(() => setAnimating(false), 240);
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverDay(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Helper for status strip colors
  const getStatusColor = (customStatusId?: string | null, customStatus?: any) => {
    const statusObj = customStatuses.find(s => s.id === customStatusId) || customStatus;
    const name = (statusObj?.name || '').toUpperCase();
    if (name.includes('DONE') || name.includes('COMPLETED')) return { color: '#10B981', label: 'Done', bg: '#DCFCE7', text: '#15803D' };
    if (name.includes('PROGRESS') || name.includes('DOING')) return { color: '#3B82F6', label: 'In Progress', bg: '#EFF6FF', text: '#2563EB' };
    if (name.includes('REVIEW') || name.includes('TESTING')) return { color: '#8B5CF6', label: 'Code Review', bg: '#F3E8FF', text: '#7C3AED' };
    if (name.includes('BLOCKED') || name.includes('RISK') || name.includes('URGENT')) return { color: '#EF4444', label: 'Blocked', bg: '#FEE2E2', text: '#B91C1C' };
    return { color: '#94A3B8', label: 'To Do', bg: '#F1F5F9', text: '#475569' };
  };

  // Helper for issue type icon
  const renderTypeIcon = (type?: string) => {
    switch (type) {
      case 'BUG':
        return <BugIcon label="Bug" size="small" />;
      case 'STORY':
        return <StoryIcon label="Story" size="small" />;
      case 'EPIC':
        return <EpicIcon label="Epic" size="small" />;
      default:
        return <TaskIcon label="Task" size="small" />;
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--trella-background, #F8FAFC)', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      
      {/* 1. Header Section matching Notion/Linear/Jira Premium */}
      <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--trella-border, #E2E8F0)', backgroundColor: 'var(--trella-surface, #FFFFFF)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--trella-text, #0F172A)', letterSpacing: '-0.02em' }}>
              {headerTitle}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--trella-text-subtle, #64748B)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, color: 'var(--trella-text, #334155)' }}>Project Planning Calendar</span>
              <span>•</span>
              <span>{totalScheduled} scheduled tasks</span>
              <span style={{ color: overdueCount > 0 ? '#EF4444' : 'var(--trella-text-subtle, #64748B)', fontWeight: overdueCount > 0 ? 700 : 400 }}>
                • {overdueCount} overdue
              </span>
              <span>• {dueThisWeekCount} due this week</span>
            </p>
          </div>

          {/* Top Right Quick Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleTodayClick}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--trella-brand, #2563EB)',
                backgroundColor: 'var(--trella-surface-selected, #EFF6FF)',
                border: '1px solid var(--trella-border-strong, #BFDBFE)',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              Today
            </button>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 6, backgroundColor: 'var(--trella-surface, #FFFFFF)', overflow: 'hidden' }}>
              <button
                onClick={handlePrev}
                title="Previous"
                style={{ padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--trella-text-subtle, #475569)' }}
              >
                <ChevronLeft size={16} />
              </button>
              <div style={{ width: 1, height: 16, backgroundColor: 'var(--trella-border, #E2E8F0)' }} />
              <button
                onClick={handleNext}
                title="Next"
                style={{ padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--trella-text-subtle, #475569)' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 2. Compact Modern Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
          
          {/* Left Controls: Search + Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={14} color="var(--trella-text-subtlest, #94A3B8)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 12px 6px 32px',
                  fontSize: 13,
                  border: '1px solid var(--trella-border, #E2E8F0)',
                  borderRadius: 6,
                  backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)',
                  outline: 'none',
                  width: 190,
                  color: 'var(--trella-text, #1E293B)',
                }}
              />
            </div>

            {/* Status Filter */}
            <div style={{ position: 'relative' }}>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  padding: '6px 28px 6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--trella-text-subtle, #475569)',
                  backgroundColor: 'var(--trella-surface, #FFFFFF)',
                  border: '1px solid var(--trella-border, #E2E8F0)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  appearance: 'none',
                  outline: 'none',
                }}
              >
                <option value="ALL">Status: All</option>
                <option value="TODO">Status: To Do</option>
                <option value="IN_PROGRESS">Status: In Progress</option>
                <option value="REVIEW">Status: Code Review</option>
                <option value="DONE">Status: Done</option>
                <option value="BLOCKED">Status: Blocked</option>
              </select>
              <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>

            {/* Assignee Filter */}
            <div style={{ position: 'relative' }}>
              <select
                value={assigneeFilter}
                onChange={e => setAssigneeFilter(e.target.value)}
                style={{
                  padding: '6px 28px 6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--trella-text-subtle, #475569)',
                  backgroundColor: 'var(--trella-surface, #FFFFFF)',
                  border: '1px solid var(--trella-border, #E2E8F0)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  appearance: 'none',
                  outline: 'none',
                }}
              >
                <option value="ALL">Assignee: All</option>
                <option value="UNASSIGNED">Unassigned</option>
                {workspaceMembers.map(m => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName || m.email}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} color="var(--trella-text-subtle, #64748B)" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>

            {/* Priority Filter */}
            <div style={{ position: 'relative' }}>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                style={{
                  padding: '6px 28px 6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--trella-text-subtle, #475569)',
                  backgroundColor: 'var(--trella-surface, #FFFFFF)',
                  border: '1px solid var(--trella-border, #E2E8F0)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  appearance: 'none',
                  outline: 'none',
                }}
              >
                <option value="ALL">Priority: All</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <ChevronDown size={12} color="var(--trella-text-subtle, #64748B)" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Right Controls: Active View Switcher & Item Count Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--trella-text-subtle, #64748B)', backgroundColor: 'var(--trella-surface-sunken, #F1F5F9)', padding: '4px 10px', borderRadius: 12 }}>
              {filteredTasks.length} {filteredTasks.length === 1 ? 'Task' : 'Tasks'}
            </span>

            {/* Interactive View Mode Dropdown (Month / Week / Day) */}
            <div style={{ position: 'relative' }}>
              <select
                value={viewMode}
                onChange={e => setViewMode(e.target.value as 'MONTH' | 'WEEK' | 'DAY')}
                style={{
                  padding: '6px 28px 6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--trella-brand, #2563EB)',
                  backgroundColor: 'var(--trella-surface-selected, #EFF6FF)',
                  border: '1px solid var(--trella-border-strong, #BFDBFE)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  appearance: 'none',
                  outline: 'none',
                }}
              >
                <option value="MONTH">Month View</option>
                <option value="WEEK">Week View</option>
                <option value="DAY">Day View</option>
              </select>
              <ChevronDown size={12} color="var(--trella-brand, #2563EB)" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Calendar Grid Area with Horizontal Slide Animation */}
      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        <div
          ref={gridRef}
          style={{
            display: 'grid',
            gridTemplateColumns: viewMode === 'DAY' ? '1fr' : 'repeat(7, 1fr)',
            gap: 1,
            backgroundColor: 'var(--trella-border, #E2E8F0)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            transform: animating
              ? slideDirection === 'right'
                ? 'translateX(12px)'
                : 'translateX(-12px)'
              : 'translateX(0)',
            opacity: animating ? 0.85 : 1,
            transition: 'transform 240ms ease-out, opacity 240ms ease-out',
          }}
        >
          {/* Weekday Column Headers (Month / Week View) */}
          {viewMode !== 'DAY' && ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <div
              key={d}
              style={{
                backgroundColor: i === 0 || i === 6 ? 'var(--trella-surface-sunken, #F1F5F9)' : 'var(--trella-surface, #FFFFFF)',
                padding: '10px 12px',
                textAlign: 'center',
                borderBottom: '1px solid var(--trella-border, #E2E8F0)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 || i === 6 ? 'var(--trella-text-subtle, #64748B)' : 'var(--trella-text, #334155)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {d}
              </span>
            </div>
          ))}

          {/* Day View Single Header */}
          {viewMode === 'DAY' && (
            <div style={{ backgroundColor: 'var(--trella-surface, #FFFFFF)', padding: '12px 16px', borderBottom: '1px solid var(--trella-border, #E2E8F0)', fontSize: 14, fontWeight: 800, color: 'var(--trella-text, #0F172A)' }}>
              {format(currentDate, 'EEEE, MMMM d, yyyy')}
            </div>
          )}

          {/* Leading Blank Cells (Month View only) */}
          {viewMode === 'MONTH' && Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} style={{ backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)', minHeight: 110 }} />
          ))}

          {/* Days Grid Cells */}
          {daysInView.map(day => {
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            const isTodayDay = isSameDay(day, today);
            
            // Get tasks due on this date
            const dayTasks = filteredTasks.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), day));
            const maxVisible = viewMode === 'DAY' ? 20 : 3;
            const visibleTasks = dayTasks.slice(0, maxVisible);
            const extraCount = Math.max(0, dayTasks.length - maxVisible);

            return (
              <CalendarCell
                key={day.toISOString()}
                day={day}
                isWeekend={isWeekend}
                isToday={isTodayDay}
                tasks={dayTasks}
                visibleTasks={visibleTasks}
                extraCount={extraCount}
                viewMode={viewMode}
                getStatusColor={getStatusColor}
                renderTypeIcon={renderTypeIcon}
                onSelectTask={setSelectedTask}
                onTaskHover={(task, e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredTask({ task, rect });
                }}
                onTaskLeave={() => setHoveredTask(null)}
                onMoreClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setPopoverDay({ day, tasks: dayTasks, rect });
                }}
              />
            );
          })}
        </div>
      </div>

      {/* 4. Rich Floating Task Hover Tooltip */}
      {hoveredTask && (
        <TaskHoverTooltip
          task={hoveredTask.task}
          rect={hoveredTask.rect}
          workspaceMembers={workspaceMembers}
          getStatusColor={getStatusColor}
        />
      )}

      {/* 5. Floating Popover for "+N more" Tasks */}
      {popoverDay && (
        <DayMorePopover
          popoverRef={popoverRef}
          day={popoverDay.day}
          tasks={popoverDay.tasks}
          rect={popoverDay.rect}
          onClose={() => setPopoverDay(null)}
          onSelectTask={(task) => {
            setPopoverDay(null);
            setSelectedTask(task);
          }}
          getStatusColor={getStatusColor}
          renderTypeIcon={renderTypeIcon}
        />
      )}

      {/* 6. Task Detail Drawer */}
      <TaskDetailDrawer
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask}
        workspaceId={workspaceId}
        projectMembers={projectMembers}
      />
    </div>
  );
}

// ------------------------------------------------------------------ //
// Calendar Day Cell Component                                        //
// ------------------------------------------------------------------ //

interface CalendarCellProps {
  day: Date;
  isWeekend: boolean;
  isToday: boolean;
  tasks: TaskPublic[];
  visibleTasks: TaskPublic[];
  extraCount: number;
  viewMode: 'MONTH' | 'WEEK' | 'DAY';
  getStatusColor: (id?: string | null, obj?: any) => { color: string; label: string; bg: string; text: string };
  renderTypeIcon: (type?: string) => React.ReactNode;
  onSelectTask: (task: TaskPublic) => void;
  onTaskHover: (task: TaskPublic, e: React.MouseEvent<HTMLDivElement>) => void;
  onTaskLeave: () => void;
  onMoreClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function CalendarCell({
  day,
  isWeekend,
  isToday,
  tasks,
  visibleTasks,
  extraCount,
  viewMode,
  getStatusColor,
  renderTypeIcon,
  onSelectTask,
  onTaskHover,
  onTaskLeave,
  onMoreClick,
}: CalendarCellProps) {
  const [hoveredCell, setHoveredCell] = useState(false);
  const todayDate = startOfDay(new Date());

  return (
    <div
      onMouseEnter={() => setHoveredCell(true)}
      onMouseLeave={() => setHoveredCell(false)}
      style={{
        backgroundColor: isToday
          ? 'var(--trella-surface-selected, #F0F6FF)'
          : isWeekend && viewMode !== 'DAY'
          ? 'var(--trella-surface-sunken, #F8FAFC)'
          : hoveredCell
          ? 'var(--trella-surface-hover, #F1F5F9)'
          : 'var(--trella-surface, #FFFFFF)',
        minHeight: viewMode === 'DAY' ? 320 : 115,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        border: isToday ? '2px solid var(--trella-brand, #3B82F6)' : '1px solid transparent',
        transition: 'background-color 120ms ease, border-color 120ms ease',
      }}
    >
      {/* Date Header Number */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {isToday ? (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: 'var(--trella-brand, #2563EB)',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(37,99,235,0.3)',
            }}
          >
            {format(day, 'd')}
          </div>
        ) : (
          <span
            style={{
              fontSize: 12,
              fontWeight: hoveredCell || tasks.length > 0 ? 700 : 500,
              color: isWeekend ? 'var(--trella-text-subtle, #64748B)' : 'var(--trella-text, #334155)',
            }}
          >
            {viewMode === 'WEEK' ? format(day, 'EEE d') : format(day, 'd')}
          </span>
        )}

        {/* Faint "+" Affordance on Empty Cell Hover */}
        {hoveredCell && tasks.length === 0 && (
          <Plus size={14} color="var(--trella-text-subtlest, #94A3B8)" style={{ opacity: 0.6 }} />
        )}
      </div>

      {/* Task Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {visibleTasks.map(task => {
          const status = getStatusColor(task.customStatusId, task.customStatus);
          const due = task.dueDate ? startOfDay(new Date(task.dueDate)) : null;
          const isOverdue = due && isBefore(due, todayDate) && status.label !== 'Done';

          return (
            <CalendarTaskCard
              key={task.id}
              task={task}
              statusColor={status.color}
              isOverdue={isOverdue}
              renderTypeIcon={renderTypeIcon}
              onClick={() => onSelectTask(task)}
              onMouseEnter={(e) => onTaskHover(task, e)}
              onMouseLeave={onTaskLeave}
            />
          );
        })}

        {/* "+N more" Badge */}
        {extraCount > 0 && (
          <button
            onClick={onMoreClick}
            style={{
              alignSelf: 'flex-start',
              marginTop: 2,
              padding: '2px 6px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--trella-brand, #2563EB)',
              backgroundColor: 'var(--trella-surface-selected, #EFF6FF)',
              border: '1px solid var(--trella-border-strong, #BFDBFE)',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'transform 120ms ease, background 120ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover, #DBEAFE)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-selected, #EFF6FF)')}
          >
            +{extraCount} more
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Refined Calendar Task Card Component (~24px high)                  //
// ------------------------------------------------------------------ //

interface CalendarTaskCardProps {
  task: TaskPublic;
  statusColor: string;
  isOverdue: boolean | null;
  renderTypeIcon: (type?: string) => React.ReactNode;
  onClick: () => void;
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: () => void;
}

function CalendarTaskCard({
  task,
  statusColor,
  isOverdue,
  renderTypeIcon,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: CalendarTaskCardProps) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseDown={() => setClicked(true)}
      onMouseUp={() => setClicked(false)}
      onMouseEnter={e => {
        setHovered(true);
        onMouseEnter(e);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setClicked(false);
        onMouseLeave();
      }}
      style={{
        height: 24,
        backgroundColor: 'var(--trella-surface, #FFFFFF)',
        border: '1px solid var(--trella-border, #E2E8F0)',
        borderLeft: `3px solid ${statusColor}`,
        borderRadius: 4,
        padding: '0 6px',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        cursor: 'pointer',
        boxShadow: hovered ? '0 4px 10px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
        transform: clicked ? 'scale(0.98)' : hovered ? 'translateY(-1px)' : 'none',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        overflow: 'hidden',
      }}
    >
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {renderTypeIcon(task.type)}
      </div>

      {isOverdue && (
        <span style={{ fontSize: 9, color: '#EF4444', flexShrink: 0 }} title="Overdue">🔴</span>
      )}

      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--trella-text, #1E293B)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
        }}
      >
        {task.title}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Floating Task Tooltip Component                                    //
// ------------------------------------------------------------------ //

interface TaskHoverTooltipProps {
  task: TaskPublic;
  rect: DOMRect;
  workspaceMembers: any[];
  getStatusColor: (id?: string | null, obj?: any) => { color: string; label: string; bg: string; text: string };
}

function TaskHoverTooltip({ task, rect, workspaceMembers, getStatusColor }: TaskHoverTooltipProps) {
  const assignee = workspaceMembers.find(m => m.userId === task.assigneeId);
  const status = getStatusColor(task.customStatusId, task.customStatus);
  const due = task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'No due date';

  // Tooltip position calculation
  const top = Math.max(10, rect.top - 140);
  const left = Math.min(window.innerWidth - 240, Math.max(10, rect.left));

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left,
        backgroundColor: 'var(--trella-surface-overlay, #FFFFFF)',
        border: '1px solid var(--trella-border, #E2E8F0)',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 1000,
        pointerEvents: 'none',
        width: 220,
        animation: 'fadeScaleIn 120ms ease-out forwards',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--trella-text, #0F172A)', marginBottom: 6 }}>
        {task.title}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>Assignee:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: 'var(--trella-brand, #2563EB)', color: '#FFFFFF', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {assignee ? (assignee.fullName || assignee.email).charAt(0) : '?'}
            </div>
            <span style={{ fontWeight: 600, color: 'var(--trella-text, #334155)' }}>
              {assignee ? assignee.fullName || assignee.email : 'Unassigned'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>Status:</span>
          <span style={{ padding: '2px 6px', borderRadius: 4, backgroundColor: status.bg, color: status.text, fontWeight: 700, fontSize: 10 }}>
            {status.label}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>Due Date:</span>
          <span style={{ fontWeight: 600, color: 'var(--trella-text, #334155)' }}>{due}</span>
        </div>

        {task.priority && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>Priority:</span>
            <span style={{ fontWeight: 700, color: task.priority === 'URGENT' ? '#EF4444' : 'var(--trella-brand, #2563EB)' }}>
              {task.priority}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Floating Popover for "+N more" Tasks                               //
// ------------------------------------------------------------------ //

interface DayMorePopoverProps {
  popoverRef: React.RefObject<HTMLDivElement>;
  day: Date;
  tasks: TaskPublic[];
  rect: DOMRect;
  onClose: () => void;
  onSelectTask: (task: TaskPublic) => void;
  getStatusColor: (id?: string | null, obj?: any) => { color: string; label: string; bg: string; text: string };
  renderTypeIcon: (type?: string) => React.ReactNode;
}

function DayMorePopover({
  popoverRef,
  day,
  tasks,
  rect,
  onClose,
  onSelectTask,
  getStatusColor,
  renderTypeIcon,
}: DayMorePopoverProps) {
  const top = Math.min(window.innerHeight - 260, Math.max(10, rect.top));
  const left = Math.min(window.innerWidth - 260, Math.max(10, rect.left));

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top,
        left,
        backgroundColor: 'var(--trella-surface-overlay, #FFFFFF)',
        border: '1px solid var(--trella-border, #E2E8F0)',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
        width: 250,
        zIndex: 1000,
        padding: 12,
        animation: 'fadeScaleIn 150ms ease-out forwards',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--trella-border-subtle, #F1F5F9)' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--trella-text, #0F172A)' }}>
          {format(day, 'MMMM d, yyyy')}
        </span>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: 'var(--trella-text-subtlest, #94A3B8)' }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {tasks.map(t => {
          const status = getStatusColor(t.customStatusId, t.customStatus);
          return (
            <div
              key={t.id}
              onClick={() => onSelectTask(t)}
              style={{
                padding: '6px 8px',
                border: '1px solid var(--trella-border, #E2E8F0)',
                borderLeft: `3px solid ${status.color}`,
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--trella-surface, #FFFFFF)',
                transition: 'background 120ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover, #F8FAFC)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface, #FFFFFF)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                {renderTypeIcon(t.type)}
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--trella-text, #1E293B)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.title}
                </span>
              </div>

              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 4px', borderRadius: 3, backgroundColor: status.bg, color: status.text }}>
                {status.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
