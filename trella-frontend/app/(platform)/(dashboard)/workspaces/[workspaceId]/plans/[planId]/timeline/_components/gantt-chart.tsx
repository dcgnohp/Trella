'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Calendar,
  ChevronDown,
  ChevronRight,
  Filter,
  Settings,
  Plus,
  Flag,
  MoreHorizontal,
  X,
  Check,
  Clock,
  User,
  Trash2,
  Edit3,
  Copy,
  Info,
  ChevronLeft
} from 'lucide-react';
import { toast } from 'sonner';

import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import EpicIcon from '@atlaskit/icon/core/epic';
import TaskIcon from '@atlaskit/icon/core/task';

export interface GanttEpic {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  type?: string;
  issueKey?: string;
  priority?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  progressPct?: number;
  storyPoint?: number | null;
  storyPoints?: number | null;
  customStatusId?: string | null;
  customStatus?: {
    id: string;
    name: string;
    canonicalStatus: string;
  } | null;
}

interface GanttChartProps {
  epics: GanttEpic[];
  onEpicDateChange: (epicId: string, updates: { startDate: string; dueDate: string; storyPoints?: number }) => void;
  onSelectTask?: (task: GanttEpic) => void;
  onDeleteTask?: (taskId: string) => void;
}

const LEFT_PANEL_WIDTH = 480;
const ROW_HEIGHT = 44;

export function GanttChart({ epics, onEpicDateChange, onSelectTask, onDeleteTask }: GanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState<'Week' | 'Month' | 'Quarter'>('Month');
  const [baseDate, setBaseDate] = useState<Date>(new Date('2026-07-01'));
  const [searchQuery, setSearchQuery] = useState('');
  const [isGroupExpanded, setIsGroupExpanded] = useState(true);
  const [contextMenuTask, setContextMenuTask] = useState<{ task: GanttEpic; x: number; y: number } | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // ResizeObserver for dynamic full-width Gantt columns
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(scrollContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // Handle Date Navigation (< and > buttons)
  const handlePrevDate = () => {
    const d = new Date(baseDate);
    if (zoomLevel === 'Week') d.setDate(d.getDate() - 7);
    else if (zoomLevel === 'Quarter') d.setMonth(d.getMonth() - 3);
    else d.setDate(d.getDate() - 28);
    setBaseDate(d);
  };

  const handleNextDate = () => {
    const d = new Date(baseDate);
    if (zoomLevel === 'Week') d.setDate(d.getDate() + 7);
    else if (zoomLevel === 'Quarter') d.setMonth(d.getMonth() + 3);
    else d.setDate(d.getDate() + 28);
    setBaseDate(d);
  };

  // Dynamic Date Columns Generation based on zoomLevel and baseDate
  const columns = useMemo(() => {
    if (zoomLevel === 'Week') {
      const cols = [];
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      for (let i = 0; i < 7; i++) {
        const cur = new Date(baseDate);
        cur.setDate(cur.getDate() + i);
        cols.push({
          id: `day-${i}`,
          label: `${dayNames[i]} ${cur.getMonth() + 1}/${cur.getDate()}`,
          sublabel: `Day ${i + 1}`,
          startDate: new Date(cur.setHours(0, 0, 0, 0)),
          endDate: new Date(cur.setHours(23, 59, 59, 999)),
        });
      }
      return cols;
    }

    if (zoomLevel === 'Quarter') {
      const cols = [];
      for (let i = 0; i < 3; i++) {
        const cur = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
        const nextMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + i + 1, 0);
        cols.push({
          id: `month-${i}`,
          label: cur.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
          sublabel: `Month ${i + 1}`,
          startDate: cur,
          endDate: nextMonth,
        });
      }
      return cols;
    }

    // Default: Month View (4 Weekly Columns)
    const cols = [];
    for (let i = 0; i < 4; i++) {
      const start = new Date(baseDate);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      cols.push({
        id: `week-${i}`,
        label: `${formatDateShort(start)} – ${formatDateShort(end)}`,
        sublabel: `W${28 + i}`,
        startDate: start,
        endDate: end,
      });
    }
    return cols;
  }, [zoomLevel, baseDate]);

  // Date Range Title Text
  const dateRangeTitle = useMemo(() => {
    if (columns.length === 0) return 'Jul 1 – Aug 2, 2026';
    const first = columns[0].startDate;
    const last = columns[columns.length - 1].endDate;
    return `${formatDateShort(first)} – ${formatDateShort(last)}, ${first.getFullYear()}`;
  }, [columns]);

  // Column width calculations
  const colWidth = useMemo(() => {
    const minColWidth = zoomLevel === 'Week' ? 140 : zoomLevel === 'Quarter' ? 220 : 180;
    const stretchColWidth = Math.floor(containerWidth / columns.length);
    return Math.max(minColWidth, stretchColWidth);
  }, [containerWidth, columns.length, zoomLevel]);

  const rangeStart = columns[0].startDate;
  const rangeEnd = columns[columns.length - 1].endDate;
  const totalDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)));
  const totalWidth = useMemo(() => columns.length * colWidth, [columns.length, colWidth]);

  // Compute X position for a given date
  const dateToX = (date: Date) => {
    const daysFromStart = (date.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24);
    const pxPerDay = totalWidth / totalDays;
    return Math.max(0, Math.min(totalWidth, daysFromStart * pxPerDay));
  };

  const todayX = dateToX(new Date('2026-07-20'));

  // Filter epics by search query
  const filteredEpics = useMemo(() => {
    return epics.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [epics, searchQuery]);

  // Auto scroll to today on mount
  const scrollToToday = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = Math.max(0, todayX - 200);
    }
  };

  useEffect(() => {
    scrollToToday();
  }, [todayX]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuTask(null);
      } else if (e.key === 'Delete' && selectedTaskIds.length > 0 && onDeleteTask) {
        selectedTaskIds.forEach(id => onDeleteTask(id));
        setSelectedTaskIds([]);
        toast.success('Selected tasks deleted');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskIds, onDeleteTask]);

  // Status colors helper
  const getStatusColor = (statusName?: string) => {
    switch (statusName) {
      case 'IN PROGRESS':
      case 'In Progress':
        return { barBg: '#3B82F6', pillBg: '#EFF6FF', text: '#2563EB' };
      case 'CODE REVIEW':
      case 'Code Review':
        return { barBg: '#8B5CF6', pillBg: '#F3E8FF', text: '#7C3AED' };
      case 'PENDING':
      case 'Pending':
        return { barBg: '#94A3B8', pillBg: '#F1F5F9', text: '#475569' };
      case 'DONE':
      case 'Done':
      case 'Completed':
        return { barBg: '#10B981', pillBg: '#DCFCE7', text: '#15803D' };
      default:
        return { barBg: '#E2E8F0', pillBg: '#F8FAFC', text: '#64748B' };
    }
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--trella-surface, #FFFFFF)', color: 'var(--trella-text, #1E293B)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* 1. Header Toolbar matching reference screenshot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--trella-border, #E2E8F0)', flexShrink: 0, backgroundColor: 'var(--trella-surface, #FFFFFF)' }}>
        {/* Left Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <Search size={14} color="var(--trella-text-subtlest, #94A3B8)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search timeline"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 12px 6px 32px',
                fontSize: 13,
                border: '1px solid var(--trella-border, #E2E8F0)',
                borderRadius: 6,
                backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)',
                outline: 'none',
                width: 180,
                color: 'var(--trella-text, #334155)',
              }}
            />
          </div>

          <button style={{ padding: '6px 10px', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 6, backgroundColor: 'var(--trella-surface, #FFFFFF)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--trella-text-subtle, #475569)' }}>
            <Calendar size={14} color="var(--trella-text-subtle, #64748B)" />
          </button>

          {/* Interactive Date Navigator (< and >) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--trella-text, #1E293B)' }}>
            <button
              onClick={handlePrevDate}
              title="Previous period"
              style={{ border: '1px solid var(--trella-border, #E2E8F0)', background: 'var(--trella-surface, #FFFFFF)', borderRadius: 4, cursor: 'pointer', padding: '3px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={15} color="var(--trella-text-subtle, #475569)" />
            </button>
            <span style={{ minWidth: 160, textAlign: 'center' }}>{dateRangeTitle}</span>
            <Info size={14} color="var(--trella-text-subtlest, #94A3B8)" style={{ cursor: 'pointer' }} />
            <button
              onClick={handleNextDate}
              title="Next period"
              style={{ border: '1px solid var(--trella-border, #E2E8F0)', background: 'var(--trella-surface, #FFFFFF)', borderRadius: 4, cursor: 'pointer', padding: '3px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronRight size={15} color="var(--trella-text-subtle, #475569)" />
            </button>
          </div>
        </div>

        {/* Right Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{ padding: '6px 12px', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 6, backgroundColor: 'var(--trella-surface, #FFFFFF)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--trella-text-subtle, #475569)' }}>
            <Filter size={13} color="var(--trella-text-subtle, #64748B)" /> Filter
          </button>

          <button style={{ padding: '6px 12px', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 6, backgroundColor: 'var(--trella-surface, #FFFFFF)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--trella-text-subtle, #475569)' }}>
            <Settings size={13} color="var(--trella-text-subtle, #64748B)" /> View settings
          </button>

          <button
            onClick={scrollToToday}
            style={{ padding: '6px 12px', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 6, backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--trella-text, #334155)' }}
          >
            Today
          </button>

          {/* Interactive Zoom Level Switcher */}
          <div style={{ display: 'flex', backgroundColor: 'var(--trella-surface-hover, #F1F5F9)', borderRadius: 6, padding: 2, border: '1px solid var(--trella-border, #E2E8F0)' }}>
            {(['Week', 'Month', 'Quarter'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setZoomLevel(mode)}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: zoomLevel === mode ? 700 : 500,
                  color: zoomLevel === mode ? 'var(--trella-brand, #2563EB)' : 'var(--trella-text-subtle, #64748B)',
                  backgroundColor: zoomLevel === mode ? 'var(--trella-surface, #FFFFFF)' : 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  boxShadow: zoomLevel === mode ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 120ms ease',
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          <button style={{ padding: 6, border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 6, backgroundColor: 'var(--trella-surface, #FFFFFF)', cursor: 'pointer' }}>
            <MoreHorizontal size={14} color="var(--trella-text-subtle, #64748B)" />
          </button>
        </div>
      </div>

      {/* 2. Main Timeline Split Container (Left Table + Right Full-Width Gantt Grid) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        
        {/* Left Tree Table Panel */}
        <div style={{ width: LEFT_PANEL_WIDTH, flexShrink: 0, borderRight: '1px solid var(--trella-border, #E2E8F0)', backgroundColor: 'var(--trella-surface, #FFFFFF)', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
          {/* Table Header */}
          <div style={{ height: ROW_HEIGHT, borderBottom: '1px solid var(--trella-border, #E2E8F0)', display: 'flex', alignItems: 'center', padding: '0 16px', backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)', fontSize: 11, fontWeight: 700, color: 'var(--trella-text-subtlest, #94A3B8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <div style={{ width: 220 }}>Work item</div>
            <div style={{ width: 110, paddingLeft: 12 }}>Assignee</div>
            <div style={{ width: 120, textAlign: 'right', paddingRight: 8 }}>Status</div>
          </div>

          {/* Table Rows Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Group Header Row */}
            <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--trella-border-subtle, #F1F5F9)', backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)', fontSize: 12, fontWeight: 700, color: 'var(--trella-text, #334155)' }}>
              <button
                onClick={() => setIsGroupExpanded(!isGroupExpanded)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginRight: 8, display: 'flex', alignItems: 'center' }}
              >
                {isGroupExpanded ? <ChevronDown size={14} color="var(--trella-text-subtle, #64748B)" /> : <ChevronRight size={14} color="var(--trella-text-subtle, #64748B)" />}
              </button>
              <span style={{ marginRight: 8 }}>All Items</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--trella-text-subtle, #64748B)', backgroundColor: 'var(--trella-surface-hover, #E2E8F0)', padding: '2px 8px', borderRadius: 12 }}>
                {filteredEpics.length} items
              </span>
            </div>

            {/* Task Rows */}
            {isGroupExpanded && filteredEpics.map((epic, idx) => {
              const statusColors = getStatusColor(epic.customStatus?.name);
              const isSelected = selectedTaskIds.includes(epic.id);

              return (
                <div
                  key={epic.id}
                  onClick={() => onSelectTask?.(epic)}
                  style={{
                    height: ROW_HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    borderBottom: '1px solid var(--trella-border-subtle, #F1F5F9)',
                    backgroundColor: isSelected ? 'var(--trella-surface-selected, #EFF6FF)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover, #F8FAFC)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div style={{ width: 18, fontSize: 11, color: 'var(--trella-text-subtlest, #94A3B8)', fontWeight: 600, flexShrink: 0 }}>{idx + 1}</div>
                  
                  {/* Issue Type Icon + Key + Title */}
                  <div style={{ width: 200, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', flexShrink: 0 }}>
                    {renderTypeIcon(epic.type)}
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--trella-brand, #2563EB)', flexShrink: 0 }}>
                      {epic.issueKey || `TSK-${idx}`}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--trella-text, #1E293B)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {epic.title}
                    </span>
                  </div>

                  {/* Assignee Avatar + Name */}
                  <div style={{ width: 110, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, flexShrink: 0 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: 'var(--trella-brand, #3B82F6)', color: '#FFFFFF', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {epic.assigneeName ? epic.assigneeName.charAt(0) : '?'}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--trella-text, #334155)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {epic.assigneeName || 'Unassigned'}
                    </span>
                  </div>

                  {/* Status Dropdown Pill */}
                  <div style={{ width: 120, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        backgroundColor: statusColors.pillBg,
                        color: statusColors.text,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        whiteSpace: 'nowrap',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                      }}
                    >
                      {epic.customStatus?.name || 'IN PROGRESS'}
                      <ChevronDown size={10} />
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Add Work Item Button */}
            <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 16px', color: 'var(--trella-brand, #2563EB)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={14} style={{ marginRight: 6 }} /> Add work item
            </div>
          </div>
        </div>

        {/* Right Scrollable Full-Width Gantt Canvas Panel */}
        <div ref={scrollContainerRef} style={{ flex: 1, overflowX: 'auto', position: 'relative', backgroundColor: 'var(--trella-surface, #FFFFFF)' }}>
          
          {/* Gantt Header Columns */}
          <div style={{ display: 'flex', height: ROW_HEIGHT, borderBottom: '1px solid var(--trella-border, #E2E8F0)', backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)', position: 'sticky', top: 0, zIndex: 5, width: totalWidth }}>
            {columns.map(col => (
              <div key={col.id} style={{ width: colWidth, flexShrink: 0, borderRight: '1px solid var(--trella-border, #E2E8F0)', padding: '6px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--trella-text, #334155)' }}>{col.label}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--trella-text-subtlest, #94A3B8)' }}>{col.sublabel}</span>
              </div>
            ))}
          </div>

          {/* Today Indicator Line */}
          {todayX >= 0 && todayX <= totalWidth && (
            <div
              style={{
                position: 'absolute',
                left: todayX,
                top: ROW_HEIGHT,
                bottom: 0,
                width: 2,
                borderLeft: '2px dashed #2563EB',
                zIndex: 6,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  left: -18,
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#FFFFFF',
                  backgroundColor: '#2563EB',
                  padding: '2px 8px',
                  borderRadius: 12,
                  boxShadow: '0 2px 4px rgba(37,99,235,0.3)',
                }}
              >
                Today
              </div>
            </div>
          )}

          {/* Gantt Bars Rows */}
          <div style={{ position: 'relative', width: totalWidth }}>
            {/* Blank Group Row Space */}
            <div style={{ height: ROW_HEIGHT, borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }} />

            {isGroupExpanded && filteredEpics.map((epic, idx) => (
              <GanttInteractiveBarRow
                key={epic.id}
                epic={epic}
                index={idx}
                rangeStart={rangeStart}
                totalDays={totalDays}
                totalWidth={totalWidth}
                colWidth={colWidth}
                dateToX={dateToX}
                onEpicDateChange={onEpicDateChange}
                onSelectTask={onSelectTask}
                onContextMenu={(e, task) => {
                  e.preventDefault();
                  setContextMenuTask({ task, x: e.clientX, y: e.clientY });
                }}
                getStatusColor={getStatusColor}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 3. Right-Click Quick Action Context Menu */}
      {contextMenuTask && (
        <div
          style={{
            position: 'fixed',
            left: contextMenuTask.x,
            top: contextMenuTask.y,
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
            padding: 6,
            zIndex: 1000,
            width: 160,
            animation: 'fadeScaleIn 120ms ease-out forwards',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            onClick={() => {
              onSelectTask?.(contextMenuTask.task);
              setContextMenuTask(null);
            }}
            style={{ padding: '6px 10px', fontSize: 12, fontWeight: 500, color: '#334155', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Edit3 size={13} color="#64748B" /> Edit Details
          </div>

          <div
            onClick={() => {
              toast.success(`Copied ${contextMenuTask.task.title}`);
              setContextMenuTask(null);
            }}
            style={{ padding: '6px 10px', fontSize: 12, fontWeight: 500, color: '#334155', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Copy size={13} color="#64748B" /> Duplicate Task
          </div>

          <div style={{ height: 1, backgroundColor: '#F1F5F9', margin: '4px 0' }} />

          <div
            onClick={() => {
              if (onDeleteTask) onDeleteTask(contextMenuTask.task.id);
              setContextMenuTask(null);
              toast.success('Task deleted');
            }}
            style={{ padding: '6px 10px', fontSize: 12, fontWeight: 500, color: '#EF4444', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FEE2E2')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Trash2 size={13} color="#EF4444" /> Delete Task
          </div>
        </div>
      )}

      {/* 4. Bottom Metrics & Dashboard Widgets */}
      {/* 4. Bottom Metrics & Dashboard Widgets */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--trella-border, #E2E8F0)', backgroundColor: 'var(--trella-surface-sunken, #F8FAFC)', display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1.2fr 1.2fr', gap: 16 }}>
        
        {/* Card 1: Progress Overview */}
        <div style={{ backgroundColor: 'var(--trella-surface, #FFFFFF)', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 10, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--trella-text, #1E293B)', margin: '0 0 12px' }}>Progress overview</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 70, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="70" height="70" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="var(--trella-surface-sunken, #F1F5F9)" strokeWidth="12" />
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#3B82F6" strokeWidth="12" strokeDasharray="84 240" strokeDashoffset="0" />
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#10B981" strokeWidth="12" strokeDasharray="60 240" strokeDashoffset="-84" />
              </svg>
              <div style={{ position: 'absolute', fontSize: 16, fontWeight: 800, color: 'var(--trella-text, #1E293B)' }}>35%</div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>● Completed</span>
                <span style={{ fontWeight: 700, color: 'var(--trella-text, #1E293B)' }}>3</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>● In progress</span>
                <span style={{ fontWeight: 700, color: 'var(--trella-text, #1E293B)' }}>4</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>● To do</span>
                <span style={{ fontWeight: 700, color: 'var(--trella-text, #1E293B)' }}>3</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Work items by status */}
        <div style={{ backgroundColor: 'var(--trella-surface, #FFFFFF)', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 10, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--trella-text, #1E293B)', margin: '0 0 12px' }}>Work items by status</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 24, height: 65, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: '30%', backgroundColor: '#94A3B8' }} />
              <div style={{ height: '40%', backgroundColor: '#3B82F6' }} />
              <div style={{ height: '10%', backgroundColor: '#F59E0B' }} />
              <div style={{ height: '10%', backgroundColor: '#8B5CF6' }} />
              <div style={{ height: '10%', backgroundColor: '#10B981' }} />
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>● To do</span><span style={{ fontWeight: 600, color: 'var(--trella-text, #1E293B)' }}>3 (30%)</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>● In progress</span><span style={{ fontWeight: 600, color: 'var(--trella-text, #1E293B)' }}>4 (40%)</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>● Pending</span><span style={{ fontWeight: 600, color: 'var(--trella-text, #1E293B)' }}>1 (10%)</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>● Code review</span><span style={{ fontWeight: 600, color: 'var(--trella-text, #1E293B)' }}>1 (10%)</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--trella-text-subtle, #64748B)' }}>● Completed</span><span style={{ fontWeight: 600, color: 'var(--trella-text, #1E293B)' }}>1 (10%)</span></div>
            </div>
          </div>
        </div>

        {/* Card 3: Workload balance */}
        <div style={{ backgroundColor: 'var(--trella-surface, #FFFFFF)', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 10, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--trella-text, #1E293B)', margin: '0 0 12px' }}>Workload balance</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'var(--trella-brand, #3B82F6)', color: '#FFFFFF', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
              <span style={{ flex: 1, color: 'var(--trella-text, #334155)' }}>Phong Duc</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, backgroundColor: 'var(--trella-surface-hover, #E2E8F0)', overflow: 'hidden' }}><div style={{ width: '60%', height: '100%', backgroundColor: 'var(--trella-brand, #2563EB)' }} /></div>
              <span style={{ fontWeight: 700, width: 12, textAlign: 'right', color: 'var(--trella-text, #1E293B)' }}>4</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'var(--trella-text-subtlest, #94A3B8)', color: '#FFFFFF', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</div>
              <span style={{ flex: 1, color: 'var(--trella-text, #334155)' }}>Unassigned</span>
              <div style={{ width: 60, height: 6, borderRadius: 3, backgroundColor: 'var(--trella-surface-hover, #E2E8F0)', overflow: 'hidden' }}><div style={{ width: '80%', height: '100%', backgroundColor: 'var(--trella-text-subtlest, #94A3B8)' }} /></div>
              <span style={{ fontWeight: 700, width: 12, textAlign: 'right', color: 'var(--trella-text, #1E293B)' }}>6</span>
            </div>
          </div>
        </div>

        {/* Card 4: Milestones */}
        <div style={{ backgroundColor: 'var(--trella-surface, #FFFFFF)', border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 10, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--trella-text, #1E293B)', margin: '0 0 10px' }}>Milestones</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flag size={14} color="var(--trella-brand, #2563EB)" />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--trella-text, #1E293B)' }}>Sprint goal</div>
                <div style={{ fontSize: 10, color: 'var(--trella-text-subtle, #64748B)' }}>Jul 20, 2026</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--trella-brand, #2563EB)' }}>60%</span>
            </div>

            <button style={{ width: '100%', padding: '5px 0', border: '1px dashed var(--trella-border-strong, #BFDBFE)', borderRadius: 6, backgroundColor: 'var(--trella-surface-selected, #EFF6FF)', color: 'var(--trella-brand, #2563EB)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Plus size={12} /> Add milestone
            </button>
          </div>
        </div>

      </div>

      {/* 5. Footer Pagination Row */}
      <div style={{ padding: '10px 20px', borderTop: '1px solid var(--trella-border, #E2E8F0)', backgroundColor: 'var(--trella-surface, #FFFFFF)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--trella-text-subtle, #64748B)' }}>
        <span>Showing 1-10 of {filteredEpics.length} items</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Rows per page:</span>
            <select style={{ padding: '2px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--trella-border, #E2E8F0)', backgroundColor: 'var(--trella-surface, #FFFFFF)', color: 'var(--trella-text, #1E293B)' }}>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button style={{ border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 4, padding: '2px 6px', background: 'var(--trella-surface, #FFFFFF)', color: 'var(--trella-text, #1E293B)', cursor: 'pointer' }}>‹</button>
            <span style={{ padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--trella-surface-selected, #EFF6FF)', color: 'var(--trella-brand, #2563EB)', fontWeight: 700 }}>1</span>
            <button style={{ border: '1px solid var(--trella-border, #E2E8F0)', borderRadius: 4, padding: '2px 6px', background: 'var(--trella-surface, #FFFFFF)', color: 'var(--trella-text, #1E293B)', cursor: 'pointer' }}>›</button>
          </div>
        </div>
      </div>

    </div>
  );
}

// ------------------------------------------------------------------ //
// Gantt Interactive Bar Row Component with Synced DB Story Points   //
// ------------------------------------------------------------------ //

interface GanttInteractiveBarRowProps {
  epic: GanttEpic;
  index: number;
  rangeStart: Date;
  totalDays: number;
  totalWidth: number;
  colWidth: number;
  dateToX: (d: Date) => number;
  onEpicDateChange: (epicId: string, updates: { startDate: string; dueDate: string; storyPoints?: number }) => void;
  onSelectTask?: (task: GanttEpic) => void;
  onContextMenu: (e: React.MouseEvent, task: GanttEpic) => void;
  getStatusColor: (statusName?: string) => { barBg: string; pillBg: string; text: string };
}

function GanttInteractiveBarRow({
  epic,
  index,
  rangeStart,
  totalDays,
  totalWidth,
  colWidth,
  dateToX,
  onEpicDateChange,
  onSelectTask,
  onContextMenu,
  getStatusColor,
}: GanttInteractiveBarRowProps) {
  const [hovered, setHovered] = useState(false);
  const [overrideDates, setOverrideDates] = useState<{ start: string; end: string } | null>(null);
  const dragState = useRef<{ mode: 'move' | 'resize-left' | 'resize-right'; startClientX: number; origStart: Date; origEnd: Date } | null>(null);

  // Read DB story points (support both storyPoint and storyPoints properties)
  const dbStoryPoints = epic.storyPoint ?? epic.storyPoints ?? null;

  // Parse exact startDate from task DB record
  const barStart = epic.startDate ? epic.startDate.slice(0, 10) : '2026-07-01';

  // Calculate end date based on story points velocity: 1 working day (8h) = 2 points.
  // 8 points -> 4 working days!
  const calculatedEndFromPoints = useMemo(() => {
    if (dbStoryPoints != null && dbStoryPoints > 0) {
      const days = Math.max(1, Math.round(dbStoryPoints / 2));
      const s = new Date(barStart);
      s.setDate(s.getDate() + (days - 1));
      return s.toISOString().slice(0, 10);
    }
    return epic.dueDate ? epic.dueDate.slice(0, 10) : '2026-07-05';
  }, [dbStoryPoints, barStart, epic.dueDate]);

  const barEnd = overrideDates?.end || calculatedEndFromPoints;

  const statusColors = getStatusColor(epic.customStatus?.name);
  const progressPct = epic.progressPct || (index % 2 === 0 ? 60 : 40);

  // Compute Bar Left and Width
  const startD = useMemo(() => new Date(overrideDates?.start || barStart), [overrideDates, barStart]);
  const endD = useMemo(() => new Date(barEnd), [barEnd]);
  
  const leftX = dateToX(startD);
  const rightX = dateToX(endD);
  const barWidth = Math.max(rightX - leftX, 60);

  // Compute duration in working days (including start and end dates)
  const durationDays = useMemo(() => {
    const ms = Math.max(0, endD.getTime() - startD.getTime());
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
  }, [startD, endD]);

  // Velocity Calculation: 1 Point = 4 Working Hours (0.5 Working Day) -> 1 Day (8h) = 2 Points!
  const displayStoryPoints = useMemo(() => {
    if (overrideDates) {
      return Math.max(1, Math.round(durationDays * 2));
    }
    if (dbStoryPoints != null && dbStoryPoints > 0) {
      return Math.round(dbStoryPoints);
    }
    return Math.max(1, Math.round(durationDays * 2));
  }, [overrideDates, dbStoryPoints, durationDays]);

  // Sync internal overrideDates when props change
  useEffect(() => {
    setOverrideDates(null);
  }, [epic.startDate, epic.dueDate, epic.storyPoint, epic.storyPoints]);

  // Handle Drag & Resize Events
  useEffect(() => {
    const pxPerDay = totalWidth / totalDays;

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const deltaPx = e.clientX - drag.startClientX;
      const deltaDays = Math.round(deltaPx / pxPerDay);

      if (drag.mode === 'move') {
        const newStart = new Date(drag.origStart);
        newStart.setDate(newStart.getDate() + deltaDays);
        const newEnd = new Date(drag.origEnd);
        newEnd.setDate(newEnd.getDate() + deltaDays);
        setOverrideDates({ start: newStart.toISOString().slice(0, 10), end: newEnd.toISOString().slice(0, 10) });
      } else if (drag.mode === 'resize-right') {
        const newEnd = new Date(drag.origEnd);
        newEnd.setDate(newEnd.getDate() + deltaDays);
        if (newEnd > drag.origStart) {
          setOverrideDates({ start: drag.origStart.toISOString().slice(0, 10), end: newEnd.toISOString().slice(0, 10) });
        }
      } else if (drag.mode === 'resize-left') {
        const newStart = new Date(drag.origStart);
        newStart.setDate(newStart.getDate() + deltaDays);
        if (newStart < drag.origEnd) {
          setOverrideDates({ start: newStart.toISOString().slice(0, 10), end: drag.origEnd.toISOString().slice(0, 10) });
        }
      }
    };

    const handleMouseUp = () => {
      const drag = dragState.current;
      if (!drag) return;
      dragState.current = null;
      if (overrideDates) {
        onEpicDateChange(epic.id, {
          startDate: overrideDates.start,
          dueDate: overrideDates.end,
          storyPoints: displayStoryPoints,
        });
        toast.success(`Staged date & point update (${displayStoryPoints} pts) for ${epic.title}`);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [totalWidth, totalDays, overrideDates, epic.id, epic.title, displayStoryPoints, onEpicDateChange]);

  const dateLabelStr = `${formatDateShort(startD)} – ${formatDateShort(endD)}`;

  // Clamped left position so tooltip NEVER gets cut off by left tree panel
  const clampedTooltipLeft = Math.max(12, Math.min(totalWidth - 220, leftX + barWidth / 2 - 100));

  return (
    <div
      onContextMenu={e => onContextMenu(e, epic)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: ROW_HEIGHT,
        borderBottom: '1px solid #F1F5F9',
        position: 'relative',
        backgroundColor: hovered ? '#F8FAFC' : 'transparent',
      }}
    >
      {/* Interactive Gantt Task Bar */}
      <div
        onMouseDown={e => {
          e.preventDefault();
          dragState.current = {
            mode: 'move',
            startClientX: e.clientX,
            origStart: new Date(barStart),
            origEnd: new Date(barEnd),
          };
        }}
        onClick={e => {
          e.stopPropagation();
          onSelectTask?.(epic);
        }}
        style={{
          position: 'absolute',
          left: leftX,
          width: barWidth,
          height: 24,
          top: 10,
          borderRadius: 12,
          backgroundColor: statusColors.barBg,
          boxShadow: hovered ? '0 4px 12px rgba(37,99,235,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 10,
          paddingRight: 2,
          cursor: 'grab',
          transition: 'box-shadow 160ms ease',
          zIndex: 4,
        }}
      >
        {/* Left Drag Resize Handle */}
        <div
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
            dragState.current = { mode: 'resize-left', startClientX: e.clientX, origStart: new Date(barStart), origEnd: new Date(barEnd) };
          }}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }}
        />

        {/* Date Range Text Label + Dynamic Points Inside Bar */}
        <span style={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {dateLabelStr} • {displayStoryPoints} {displayStoryPoints === 1 ? 'pt' : 'pts'}
        </span>

        {/* Percentage Completion Pointed Badge on Right End */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            color: statusColors.text,
            fontSize: 10,
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 10,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {progressPct}%
        </div>

        {/* Right Drag Resize Handle */}
        <div
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
            dragState.current = { mode: 'resize-right', startClientX: e.clientX, origStart: new Date(barStart), origEnd: new Date(barEnd) };
          }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }}
        />
      </div>

      {/* Clamped Rich Floating Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: clampedTooltipLeft,
            bottom: 34,
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            fontSize: 11,
            zIndex: 1000,
            pointerEvents: 'none',
            minWidth: 210,
            animation: 'fadeScaleIn 120ms ease-out forwards',
          }}
        >
          <div style={{ fontWeight: 700, color: '#1E293B', marginBottom: 2 }}>{epic.title}</div>
          <div style={{ color: '#64748B', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span>Status:</span>
            <span style={{ fontWeight: 700, color: statusColors.text }}>{epic.customStatus?.name || 'IN PROGRESS'}</span>
          </div>
          <div style={{ color: '#64748B', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span>Duration:</span>
            <span style={{ fontWeight: 600, color: '#1E293B' }}>{dateLabelStr} ({durationDays} days)</span>
          </div>
          <div style={{ color: '#64748B', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span>Estimated Workload:</span>
            <span style={{ fontWeight: 800, color: '#2563EB' }}>{displayStoryPoints} Story Points</span>
          </div>
          <div style={{ color: '#64748B', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span>Progress:</span>
            <span style={{ fontWeight: 700, color: '#10B981' }}>{progressPct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateShort(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
