'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { token } from '@atlaskit/tokens';
import { Text } from '@atlaskit/primitives';
import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import EpicIcon from '@atlaskit/icon/core/epic';
import TaskIcon from '@atlaskit/icon/core/task';

interface GanttEpic {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  type?: string;
  issueKey?: string;
  priority?: string;
  customStatusId?: string | null;
  customStatus?: {
    id: string;
    name: string;
    canonicalStatus: string;
  } | null;
}

interface GanttChartProps {
  epics: GanttEpic[];
  onEpicDateChange: (epicId: string, dates: { startDate: string; dueDate: string }) => void;
}

const COL_WIDTH = 160;
const LEFT_PANEL = 320;
const ROW_HEIGHT = 44;
const RESIZE_HANDLE_WIDTH = 8;

function getMonthRange(startDate: Date, endDate: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cur <= end) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function dateToX(date: Date, months: Date[]): number {
  const first = months[0];
  const mi = (date.getFullYear() - first.getFullYear()) * 12 + (date.getMonth() - first.getMonth());
  const clamped = Math.max(0, Math.min(mi, months.length - 1));
  const monthStart = months[clamped];
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const dayOffset = (date.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24);
  return clamped * COL_WIDTH + (dayOffset / daysInMonth) * COL_WIDTH;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString();
}

export function GanttChart({ epics, onEpicDateChange }: GanttChartProps) {
  const today = new Date();

  // Compute date range covering all epics (fall back to a window around today).
  const allDates = epics.flatMap(e => [e.startDate, e.dueDate].filter(Boolean).map(d => new Date(d as string)));
  const rangeStart = allDates.length > 0
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const rangeEnd = allDates.length > 0
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth() + 3, 0);

  // Add buffer months
  rangeStart.setMonth(rangeStart.getMonth() - 1);
  rangeEnd.setMonth(rangeEnd.getMonth() + 1);

  const months = getMonthRange(rangeStart, rangeEnd);
  const totalDays = daysBetween(rangeStart, rangeEnd) || 1;
  const pxPerDay = (months.length * COL_WIDTH) / totalDays;

  const todayLeft = dateToX(today, months);
  const totalWidth = months.length * COL_WIDTH;

  const getBarStyle = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const left = dateToX(start, months);
    const width = Math.max(dateToX(end, months) - left, 24);
    return { left, width };
  };

  const renderTypeIcon = (type?: string) => {
    const iconStyle = { display: 'inline-flex', marginRight: 4, verticalAlign: 'middle' };
    switch (type) {
      case 'BUG':
        return <span style={iconStyle}><BugIcon label="Bug" size="small" /></span>;
      case 'STORY':
        return <span style={iconStyle}><StoryIcon label="Story" size="small" /></span>;
      case 'EPIC':
        return <span style={iconStyle}><EpicIcon label="Epic" size="small" /></span>;
      default:
        return <span style={iconStyle}><TaskIcon label="Task" size="small" /></span>;
    }
  };

  return (
    <div style={{ display: 'flex', overflow: 'hidden', flex: 1, backgroundColor: 'var(--ds-surface)', color: 'var(--ds-text)' }}>
      
      {/* Left panel */}
      <div style={{ width: LEFT_PANEL, flexShrink: 0, borderRight: '1px solid var(--ds-border)', background: 'var(--ds-surface-sunken)' }}>
        <div style={{ height: ROW_HEIGHT, borderBottom: '1px solid var(--ds-border)', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
          <Text size="small" weight="bold" color="color.text.subtle">WORK ITEM</Text>
        </div>
        {epics.map(epic => (
          <div key={epic.id} style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--ds-border)' }}>
            {renderTypeIcon(epic.type)}
            <span style={{ fontSize: 11, color: 'var(--ds-text-subtle)', fontWeight: 600, marginRight: 8 }}>
              {epic.issueKey || `TSK`}
            </span>
            <Text size="small" color="color.text">{epic.title}</Text>
          </div>
        ))}
      </div>

      {/* Right scrollable area */}
      <div style={{ flex: 1, overflowX: 'auto', position: 'relative' }}>
        {/* Month headers */}
        <div style={{ display: 'flex', height: ROW_HEIGHT, borderBottom: '1px solid var(--ds-border)', position: 'sticky', top: 0, backgroundColor: 'var(--ds-surface-sunken)', zIndex: 2, width: totalWidth }}>
          {months.map((m, i) => (
            <div key={i} style={{ width: COL_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', padding: `0 ${token('space.200')}`, borderRight: '1px solid var(--ds-border)' }}>
              <Text size="small" weight="medium" color="color.text.subtle">
                {m.toLocaleDateString('en', { month: 'short', year: 'numeric' })}
              </Text>
            </div>
          ))}
        </div>

        {/* Today line */}
        {todayLeft >= 0 && todayLeft <= totalWidth && (
          <div style={{
            position: 'absolute',
            left: todayLeft,
            top: ROW_HEIGHT,
            bottom: 0,
            width: 2,
            backgroundColor: 'var(--ds-background-brand-bold)',
            zIndex: 3,
            pointerEvents: 'none',
          }}>
            <div style={{ position: 'absolute', top: 4, left: -18, fontSize: 10, fontWeight: 600, color: 'var(--ds-text-inverse)', backgroundColor: 'var(--ds-background-brand-bold)', padding: '1px 4px', borderRadius: 2 }}>
              Today
            </div>
          </div>
        )}

        {/* Epic bars */}
        <div style={{ position: 'relative', width: totalWidth }}>
          {epics.map(epic => (
            <GanttRow
              key={epic.id}
              epic={epic}
              pxPerDay={pxPerDay}
              getBarStyle={getBarStyle}
              onEpicDateChange={onEpicDateChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface GanttRowProps {
  epic: GanttEpic;
  pxPerDay: number;
  getBarStyle: (startDate: string, endDate: string) => { left: number; width: number };
  onEpicDateChange: (epicId: string, dates: { startDate: string; dueDate: string }) => void;
}

function GanttRow({ epic, pxPerDay, getBarStyle, onEpicDateChange }: GanttRowProps) {
  const barStart = epic.startDate ?? epic.dueDate;
  const barEnd = epic.dueDate ?? epic.startDate;

  const [hovered, setHovered] = useState(false);
  const [override, setOverride] = useState<{ start: string; end: string } | null>(null);
  const dragState = useRef<{ mode: 'move' | 'resize'; startClientX: number; origStart: Date; origEnd: Date } | null>(null);

  useEffect(() => {
    setOverride(null);
  }, [epic.startDate, epic.dueDate]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const drag = dragState.current;
      if (!drag) return;
      const deltaPx = e.clientX - drag.startClientX;
      const deltaDays = Math.round(deltaPx / pxPerDay);

      if (drag.mode === 'move') {
        const newStart = addDays(drag.origStart, deltaDays);
        const newEnd = addDays(drag.origEnd, deltaDays);
        setOverride({ start: toISODate(newStart), end: toISODate(newEnd) });
      } else {
        const minEnd = addDays(drag.origStart, 1);
        const candidate = addDays(drag.origEnd, deltaDays);
        const newEnd = candidate < minEnd ? minEnd : candidate;
        setOverride({ start: toISODate(drag.origStart), end: toISODate(newEnd) });
      }
    }

    function handleMouseUp() {
      const drag = dragState.current;
      if (!drag) return;
      dragState.current = null;
      setOverride(prev => {
        if (prev) {
          onEpicDateChange(epic.id, { startDate: prev.start.slice(0, 10), dueDate: prev.end.slice(0, 10) });
        }
        return prev;
      });
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pxPerDay, epic.id, onEpicDateChange, barStart, barEnd]);

  if (!barStart || !barEnd) {
    return <div style={{ height: ROW_HEIGHT, borderBottom: '1px solid var(--ds-border)' }} />;
  }

  const effectiveStart = override?.start ?? barStart;
  const effectiveEnd = override?.end ?? barEnd;
  const barStyle = getBarStyle(effectiveStart, effectiveEnd);
  const isOverdue = new Date(effectiveEnd) < new Date();

  const startMove = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { mode: 'move', startClientX: e.clientX, origStart: new Date(barStart), origEnd: new Date(barEnd) };
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { mode: 'resize', startClientX: e.clientX, origStart: new Date(barStart), origEnd: new Date(barEnd) };
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--ds-border)', position: 'relative' }}
    >
      <div
        onMouseDown={startMove}
        style={{
          position: 'absolute',
          left: barStyle.left,
          width: barStyle.width,
          height: 20,
          borderRadius: '3px',
          display: 'flex',
          alignItems: 'center',
          paddingInline: token('space.100'),
          cursor: 'grab',
          backgroundColor: isOverdue ? 'var(--ds-background-danger-bold)' : 'var(--ds-background-brand-bold)',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--ds-text-inverse)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
          {epic.title}
        </span>
        
        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: RESIZE_HANDLE_WIDTH,
            cursor: 'ew-resize',
          }}
        />
      </div>

      {/* Floating Rich hover popup card */}
      {hovered && (
        <div style={{
          position: 'absolute',
          left: barStyle.left + barStyle.width / 2 - 110,
          bottom: 30,
          zIndex: 1000,
          background: 'var(--ds-surface-sunken)',
          border: '1px solid var(--ds-border)',
          borderRadius: 4,
          padding: '10px 14px',
          width: 220,
          boxShadow: '0 4px 14px var(--ds-shadow-overlay, rgba(0,0,0,0.4))',
          pointerEvents: 'none',
          color: 'var(--ds-text)',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}>
          <div style={{ fontSize: 11, color: 'var(--ds-text-subtle)', fontWeight: 600 }}>
            {epic.issueKey || 'TSK'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
            {epic.title}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 }}>
            <span style={{ color: 'var(--ds-text-subtle)' }}>Status:</span>
            <span style={{ fontWeight: 600 }}>{epic.customStatus?.name || 'TODO'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--ds-text-subtle)' }}>Dates:</span>
            <span style={{ fontWeight: 600 }}>{effectiveStart.slice(0, 10)} → {effectiveEnd.slice(0, 10)}</span>
          </div>
          {epic.priority && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--ds-text-subtle)' }}>Priority:</span>
              <span style={{ fontWeight: 600, color: epic.priority === 'URGENT' ? 'var(--ds-background-danger-bold)' : 'var(--ds-text)' }}>{epic.priority}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
