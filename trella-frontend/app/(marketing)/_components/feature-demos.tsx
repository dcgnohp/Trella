'use client';

/**
 * Interactive mini-demos shown inside the landing-page feature modal.
 *
 * Rule: EVERY feature gets its OWN demo that matches its name and is actually
 * interactive — visitors experience the product, not a bullet list. Charts use
 * recharts; the kanban board uses @hello-pangea/dnd for real drag & drop (both
 * are already project dependencies).
 */

import React, { useEffect, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Search,
  Sparkles,
  RefreshCw,
  Check,
  Bold,
  Italic,
  List as ListIcon,
  Heading,
  ChevronDown,
} from 'lucide-react';
import { pointsToWorkingDays } from '@/lib/sprint-velocity';

export interface DemoTheme {
  isDark: boolean;
  text: string;
  textMuted: string;
  cardBg: string;
  innerBg: string;
  border: string;
}

const AXIS = (t: DemoTheme) => ({ fontSize: 10, fill: t.textMuted });

/** Small local typewriter for chat / description demos. */
function useTyped(text: string, speed = 18, run = true) {
  const [n, setN] = useState(0);
  const ref = useRef(text);
  ref.current = text;
  useEffect(() => {
    setN(0);
    if (!run || !text) return;
    const id = setInterval(() => setN((c) => (c >= ref.current.length ? (clearInterval(id), c) : c + 1)), speed);
    return () => clearInterval(id);
  }, [text, speed, run]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

const card = (t: DemoTheme): React.CSSProperties => ({
  backgroundColor: t.cardBg,
  border: `1px solid ${t.border}`,
  borderRadius: 8,
});

// ===========================================================================
// CHARTS (recharts) — used by Reports & Sprint Summary (kept visually distinct)
// ===========================================================================
const burndownData = [
  { day: 'D1', remaining: 36, ideal: 36 }, { day: 'D2', remaining: 33, ideal: 31 },
  { day: 'D3', remaining: 30, ideal: 26 }, { day: 'D4', remaining: 22, ideal: 21 },
  { day: 'D5', remaining: 18, ideal: 16 }, { day: 'D6', remaining: 12, ideal: 11 },
  { day: 'D7', remaining: 5, ideal: 6 }, { day: 'D8', remaining: 2, ideal: 0 },
];
function BurndownChart({ t, ideal = true }: { t: DemoTheme; ideal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={burndownData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="day" tick={AXIS(t)} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS(t)} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={{ backgroundColor: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 12 }} />
        <Area type="monotone" dataKey="remaining" stroke="#3B82F6" strokeWidth={2.5} fill="url(#burnFill)" animationDuration={900} />
        {ideal && <Area type="monotone" dataKey="ideal" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 4" fill="none" animationDuration={900} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

const velocityData = [
  { sprint: 'S20', pts: 32 }, { sprint: 'S21', pts: 28 }, { sprint: 'S22', pts: 40 },
  { sprint: 'S23', pts: 37 }, { sprint: 'S24', pts: 42 },
];
function VelocityChart({ t }: { t: DemoTheme }) {
  const [active, setActive] = useState<number | null>(4);
  return (
    <div>
      <div style={{ textAlign: 'right', fontSize: 20, fontWeight: 900, color: '#8B5CF6', marginBottom: 2 }}>
        {active !== null ? velocityData[active].pts : 42}<span style={{ fontSize: 11, color: t.textMuted, fontWeight: 700 }}> pts</span>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={velocityData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} onMouseMove={(s: any) => typeof s?.activeTooltipIndex === 'number' && setActive(s.activeTooltipIndex)}>
          <XAxis dataKey="sprint" tick={AXIS(t)} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS(t)} axisLine={false} tickLine={false} width={28} />
          <Tooltip cursor={{ fill: 'rgba(139,92,246,0.1)' }} contentStyle={{ backgroundColor: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="pts" radius={[6, 6, 0, 0]} animationDuration={900}>
            {velocityData.map((_, i) => <Cell key={i} fill={i === active ? '#8B5CF6' : '#C4B5FD'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const statusData = [
  { name: 'In progress', value: 5, color: '#3B82F6' }, { name: 'Done', value: 3, color: '#34D399' },
  { name: 'To do', value: 2, color: '#C4B5FD' }, { name: 'Blocked', value: 1, color: '#FBBF24' },
];
const statusTotal = statusData.reduce((s, d) => s + d.value, 0);
function StatusDonut({ t }: { t: DemoTheme }) {
  const [active, setActive] = useState(0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, alignItems: 'center' }}>
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={statusData} dataKey="value" innerRadius={44} outerRadius={64} paddingAngle={2} stroke="none" onMouseEnter={(_, i) => setActive(i)} animationDuration={800}>
              {statusData.map((d, i) => <Cell key={i} fill={d.color} opacity={i === active ? 1 : 0.45} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: t.text }}>{statusData[active].value}</span>
          <span style={{ fontSize: 10, color: t.textMuted }}>{statusData[active].name}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {statusData.map((d, i) => (
          <div key={d.name} onMouseEnter={() => setActive(i)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 6, backgroundColor: i === active ? t.innerBg : 'transparent' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: i === active ? t.text : t.textMuted, fontWeight: i === active ? 800 : 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: d.color }} />{d.name}
            </span>
            <span style={{ fontSize: 12, color: t.textMuted }}>{d.value} ({Math.round((d.value / statusTotal) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsDemo({ t }: { t: DemoTheme }) {
  const [tab, setTab] = useState<'burndown' | 'velocity' | 'status'>('burndown');
  const tabs = [{ k: 'burndown', l: 'Burndown' }, { k: 'velocity', l: 'Velocity' }, { k: 'status', l: 'Status' }] as const;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {tabs.map((tb) => (
          <button key={tb.k} onClick={() => setTab(tb.k)} style={{ padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', backgroundColor: tab === tb.k ? '#3B82F6' : t.innerBg, color: tab === tb.k ? '#FFF' : t.textMuted }}>{tb.l}</button>
        ))}
      </div>
      {tab === 'burndown' && <BurndownChart t={t} />}
      {tab === 'velocity' && <VelocityChart t={t} />}
      {tab === 'status' && <StatusDonut t={t} />}
    </div>
  );
}

// AI Sprint Summary — health gauge + AI narrative + burndown (distinct from Reports)
function SummaryDemo({ t }: { t: DemoTheme }) {
  const [gen, setGen] = useState(false);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!gen) return;
    setPct(0);
    const id = setInterval(() => setPct((p) => (p >= 100 ? (clearInterval(id), 100) : p + 10)), 60);
    return () => clearInterval(id);
  }, [gen]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 14 }}>
      <div style={{ ...card(t), padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700 }}>Sprint Health</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: '#10B981' }}>92%</div>
        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>28 / 36 SP</div>
      </div>
      <div style={{ ...card(t), padding: 14 }}>
        <button onClick={() => setGen(true)} style={{ padding: '6px 14px', borderRadius: 8, backgroundColor: '#10B981', color: '#FFF', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer', marginBottom: 10 }}>Generate summary ✨</button>
        {gen && pct < 100 ? (
          <div>
            <div style={{ fontSize: 12, color: '#10B981', fontWeight: 800, marginBottom: 6 }}>Analyzing… {pct}%</div>
            <div style={{ height: 6, borderRadius: 6, backgroundColor: t.innerBg, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#10B981,#3B82F6)', transition: 'width 60ms linear' }} /></div>
          </div>
        ) : gen ? (
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{'• Velocity stable (+14%)\n• 0 blockers, 3 at risk\n• Recommend release on Jul 30'}</div>
        ) : (
          <BurndownChart t={t} ideal={false} />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// BOARD (KANBAN) — real drag & drop across columns
// ===========================================================================
type KCard = { id: string; title: string; who: string; pr: string };
const KCOLS: { key: string; label: string; color: string }[] = [
  { key: 'todo', label: 'To Do', color: '#F59E0B' },
  { key: 'doing', label: 'In Progress', color: '#3B82F6' },
  { key: 'done', label: 'Done', color: '#10B981' },
];
const K_INIT: Record<string, KCard[]> = {
  todo: [{ id: 'k1', title: 'Login Bug Fix', who: '#3B82F6', pr: 'URGENT' }, { id: 'k2', title: 'Billing Retry', who: '#EC4899', pr: 'MEDIUM' }],
  doing: [{ id: 'k3', title: 'OAuth Flow', who: '#8B5CF6', pr: 'HIGH' }],
  done: [{ id: 'k4', title: 'Gantt Engine', who: '#10B981', pr: 'HIGH' }],
};
function KanbanDemo({ t }: { t: DemoTheme }) {
  const [cols, setCols] = useState<Record<string, KCard[]>>(K_INIT);
  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    const from = r.source.droppableId, to = r.destination.droppableId;
    setCols((prev) => {
      const next: Record<string, KCard[]> = { todo: [...prev.todo], doing: [...prev.doing], done: [...prev.done] };
      const [moved] = next[from].splice(r.source.index, 1);
      next[to].splice(r.destination!.index, 0, moved);
      return next;
    });
  };
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 8 }}>Drag cards between columns ↔</div>
      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {KCOLS.map((c) => (
            <Droppable droppableId={c.key} key={c.key}>
              {(prov, snap) => (
                <div ref={prov.innerRef} {...prov.droppableProps} style={{ backgroundColor: snap.isDraggingOver ? (t.isDark ? '#1E293B' : '#EEF2FF') : t.innerBg, borderRadius: 10, padding: 8, minHeight: 150, transition: 'background-color 150ms ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: c.color }} />{c.label}
                  </div>
                  {cols[c.key].map((cd, i) => (
                    <Draggable draggableId={cd.id} index={i} key={cd.id}>
                      {(dp, ds) => (
                        <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} style={{ ...card(t), padding: 8, marginBottom: 6, boxShadow: ds.isDragging ? '0 8px 20px rgba(0,0,0,0.3)' : 'none', ...dp.draggableProps.style }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: t.text, marginBottom: 6 }}>{cd.title}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 8, fontWeight: 900, color: cd.pr === 'URGENT' ? '#EF4444' : '#3B82F6' }}>{cd.pr}</span>
                            <span style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: cd.who }} />
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {prov.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

// ===========================================================================
// BACKLOG — drag to re-prioritize an ordered list
// ===========================================================================
function BacklogDemo({ t }: { t: DemoTheme }) {
  const [items, setItems] = useState([
    { id: 'b1', title: 'OAuth 2.0 Auth Flow', pts: 8, pr: 'HIGH' },
    { id: 'b2', title: 'Payment Retry Queue', pts: 5, pr: 'MEDIUM' },
    { id: 'b3', title: 'Semantic Search API', pts: 13, pr: 'HIGH' },
    { id: 'b4', title: 'Release Notes v2.4', pts: 3, pr: 'LOW' },
  ]);
  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    setItems((prev) => {
      const next = [...prev];
      const [m] = next.splice(r.source.index, 1);
      next.splice(r.destination!.index, 0, m);
      return next;
    });
  };
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 8 }}>Drag to re-prioritize the backlog ↕</div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="backlog">
          {(prov) => (
            <div ref={prov.innerRef} {...prov.droppableProps} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((it, i) => (
                <Draggable draggableId={it.id} index={i} key={it.id}>
                  {(dp, ds) => (
                    <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} style={{ ...card(t), padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: ds.isDragging ? '0 8px 20px rgba(0,0,0,0.3)' : 'none', ...dp.draggableProps.style }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: t.textMuted, width: 16 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: t.text }}>{it.title}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: it.pr === 'HIGH' ? '#F59E0B' : it.pr === 'LOW' ? t.textMuted : '#3B82F6' }}>{it.pr}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.12)', padding: '2px 8px', borderRadius: 6 }}>{it.pts} SP</span>
                    </div>
                  )}
                </Draggable>
              ))}
              {prov.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

// ===========================================================================
// SPRINT PLANNING — pull backlog into a capacity-limited sprint
// ===========================================================================
function PlanningDemo({ t }: { t: DemoTheme }) {
  const backlog = [
    { id: 'p1', title: 'Payment API', pts: 8 }, { id: 'p2', title: 'OAuth Flow', pts: 5 },
    { id: 'p3', title: 'Search', pts: 13 }, { id: 'p4', title: 'Billing Queue', pts: 3 },
  ];
  const [inSprint, setInSprint] = useState<string[]>([]);
  const cap = 24;
  const used = inSprint.reduce((s, id) => s + (backlog.find((b) => b.id === id)?.pts ?? 0), 0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ ...card(t), padding: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Backlog · click to add ↦</div>
        {backlog.filter((b) => !inSprint.includes(b.id)).map((b) => (
          <button key={b.id} onClick={() => setInSprint((p) => [...p, b.id])} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 10px', marginBottom: 6, borderRadius: 6, border: `1px solid ${t.border}`, backgroundColor: t.innerBg, color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <span>{b.title}</span><span style={{ color: '#3B82F6' }}>{b.pts} SP</span>
          </button>
        ))}
      </div>
      <div style={{ ...card(t), padding: 10, borderColor: used > cap ? '#EF4444' : t.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800, color: t.textMuted, marginBottom: 6 }}>
          <span>SPRINT 25</span><span style={{ color: used > cap ? '#EF4444' : '#10B981' }}>{used}/{cap} SP</span>
        </div>
        <div style={{ height: 6, borderRadius: 6, backgroundColor: t.innerBg, overflow: 'hidden', marginBottom: 10 }}><div style={{ width: `${Math.min(100, (used / cap) * 100)}%`, height: '100%', backgroundColor: used > cap ? '#EF4444' : '#10B981', transition: 'width 250ms ease' }} /></div>
        {inSprint.length === 0 ? <div style={{ fontSize: 11, color: t.textMuted, textAlign: 'center', padding: 12, border: `1px dashed ${t.border}`, borderRadius: 8 }}>Add items to plan</div> :
          inSprint.map((id) => { const b = backlog.find((x) => x.id === id)!; return <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.text, backgroundColor: t.innerBg, borderRadius: 6, padding: '6px 10px', marginBottom: 4 }}><span>{b.title}</span><span style={{ color: t.textMuted }}>{b.pts}</span></div>; })}
        {used > cap && <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 700, marginTop: 6 }}>⚠ Over capacity by {used - cap} pts</div>}
      </div>
    </div>
  );
}

// ===========================================================================
// TIMELINE / GANTT — points -> working days (2 pts/day)
// ===========================================================================
function GanttDemo({ t }: { t: DemoTheme }) {
  const [rows, setRows] = useState([
    { name: 'OAuth Flow', start: 0, pts: 8, color: '#3B82F6' },
    { name: 'Billing Retry', start: 2, pts: 4, color: '#8B5CF6' },
    { name: 'Search API', start: 4, pts: 6, color: '#10B981' },
  ]);
  const bump = (i: number, d: number) => setRows((p) => p.map((r, j) => (j === i ? { ...r, pts: Math.max(2, r.pts + d) } : r)));
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 10 }}>Gantt roadmap · 2 pts = 1 day</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => {
          const days = pointsToWorkingDays(r.pts);
          return (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 46px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 700 }}>{r.name}</span>
              <div style={{ position: 'relative', height: 20, backgroundColor: t.innerBg, borderRadius: 6 }}>
                <div style={{ position: 'absolute', left: `${(r.start / 10) * 100}%`, width: `${(days / 10) * 100}%`, top: 2, bottom: 2, backgroundColor: r.color, borderRadius: 5, display: 'flex', alignItems: 'center', paddingLeft: 6, color: '#fff', fontSize: 10, fontWeight: 800, transition: 'width 200ms ease' }}>{days}d</div>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                <button onClick={() => bump(i, -2)} style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${t.border}`, backgroundColor: t.innerBg, color: t.text, fontWeight: 900, cursor: 'pointer', fontSize: 11 }}>−</button>
                <button onClick={() => bump(i, 2)} style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${t.border}`, backgroundColor: t.innerBg, color: t.text, fontWeight: 900, cursor: 'pointer', fontSize: 11 }}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// JIRA ↔ SCRUM SYNC — two-way, edit either side, mirror with a diff pulse
// ===========================================================================
const STATUSES = ['To Do', 'In Progress', 'Done'];
function SyncDemo({ t }: { t: DemoTheme }) {
  const [rows, setRows] = useState([
    { id: 's1', title: 'Login API', kind: 'TASK', jira: 1, scrum: 1 },
    { id: 's2', title: 'Auth Epic', kind: 'EPIC', jira: 0, scrum: 0 },
    { id: 's3', title: 'Auth Spec v2', kind: 'DOC', jira: 2, scrum: 2 },
  ]);
  const [flash, setFlash] = useState<string | null>(null);
  const cycle = (id: string, side: 'jira' | 'scrum') => {
    setRows((p) => p.map((r) => {
      if (r.id !== id) return r;
      const v = ((side === 'jira' ? r.jira : r.scrum) + 1) % 3;
      return { ...r, jira: v, scrum: v }; // two-way: change on one side mirrors to the other
    }));
    setFlash(id);
    setTimeout(() => setFlash(null), 700);
  };
  const Side = ({ side, accent }: { side: 'jira' | 'scrum'; accent: string }) => (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: accent, marginBottom: 6 }}>{side.toUpperCase()}</div>
      {rows.map((r) => (
        <button key={r.id} onClick={() => cycle(r.id, side)} style={{ ...card(t), width: '100%', textAlign: 'left', padding: '7px 9px', marginBottom: 6, cursor: 'pointer', borderColor: flash === r.id ? accent : t.border, transition: 'border-color 300ms ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 11, color: t.text, fontWeight: 700 }}>{r.title}</span>
            <span style={{ fontSize: 8, fontWeight: 800, color: accent }}>{r.kind}</span>
          </div>
          <span style={{ fontSize: 9, fontWeight: 800, color: t.textMuted }}>{STATUSES[side === 'jira' ? r.jira : r.scrum]} ↻</span>
        </button>
      ))}
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 10 }}>Click any status on <em>either</em> side — it mirrors instantly</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>
        <Side side="jira" accent="#8B5CF6" />
        <RefreshCw size={20} color="#3B82F6" style={flash ? { animation: 'trellaBlink 500ms linear' } : undefined} />
        <Side side="scrum" accent="#10B981" />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: t.isDark ? '#A7F3D0' : '#047857', fontWeight: 700, backgroundColor: t.isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '7px 10px' }}>
        💡 Bi-directional: tasks, epics & docs stay identical — teams save ~4h/week.
      </div>
    </div>
  );
}

// ===========================================================================
// AI SEARCH — live filter with highlight + type badges
// ===========================================================================
const SEARCH_INDEX = [
  { type: 'TASK', title: 'OAuth 2.0 Auth Sync', meta: 'Sprint 24' },
  { type: 'DOC', title: 'Authentication Spec v2', meta: 'Specs' },
  { type: 'TASK', title: 'Login Bug Fix', meta: 'Sprint 24' },
  { type: 'SPRINT', title: 'Sprint 24 · Jul 30', meta: '78%' },
  { type: 'MEMBER', title: 'Phong Duc', meta: 'Owner' },
];
function SearchDemo({ t }: { t: DemoTheme }) {
  const [q, setQ] = useState('auth');
  const res = SEARCH_INDEX.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()) || q === '');
  const hl = (s: string) => {
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0) return s;
    return <>{s.slice(0, i)}<mark style={{ backgroundColor: 'rgba(139,92,246,0.35)', color: t.isDark ? '#DDD6FE' : '#6D28D9', borderRadius: 3 }}>{s.slice(i, i + q.length)}</mark>{s.slice(i + q.length)}</>;
  };
  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} color={t.textMuted} style={{ position: 'absolute', left: 12, top: 11 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, docs, sprints…" style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8, border: `1px solid ${t.border}`, backgroundColor: t.cardBg, color: t.text, fontSize: 13, outline: 'none' }} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>{res.length} results</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {res.map((r, i) => (
          <div key={i} className="trella-fade-up" style={{ ...card(t), padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animationDelay: `${i * 50}ms` }}>
            <span style={{ fontSize: 12, color: t.text, fontWeight: 700 }}>{hl(r.title)}</span>
            <span style={{ fontSize: 8, fontWeight: 800, color: '#8B5CF6' }}>{r.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// AI CHAT — typed reply
// ===========================================================================
function ChatDemo({ t }: { t: DemoTheme }) {
  const [msgs, setMsgs] = useState<{ me: boolean; txt: string }[]>([{ me: true, txt: 'What is blocked in Sprint 24?' }]);
  const last = msgs[msgs.length - 1];
  const reply = '3 tasks are blocked:\n• Billing Timeout (waiting OAuth)\n• Refund API (waiting OAuth)\n→ Unblock OAuth first.';
  const [aiText, setAiText] = useState(reply);
  const { shown, done } = useTyped(last.me ? '' : aiText, 16, !last.me);
  const send = (q: string) => { setAiText('Analyzed 24 tasks + 6 docs — velocity stable (+14%), zero new blockers detected.'); setMsgs((m) => [...m, { me: true, txt: q }, { me: false, txt: 'x' }]); };
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-line', backgroundColor: m.me ? '#3B82F6' : t.cardBg, color: m.me ? '#FFF' : t.text, border: m.me ? 'none' : `1px solid ${t.border}` }}>
            {i === 0 ? m.txt : m.me ? m.txt : <>{shown}{!done && <span style={{ color: '#8B5CF6' }}>▌</span>}</>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['Any risks?', 'Draft standup', 'Summarize'].map((q) => (
          <button key={q} onClick={() => send(q)} style={{ padding: '5px 10px', borderRadius: 14, border: `1px solid ${t.border}`, backgroundColor: t.cardBg, color: t.textMuted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{q}</button>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// AI TASK DESCRIPTION — generate spec section by section
// ===========================================================================
function DescriptionDemo({ t }: { t: DemoTheme }) {
  const [go, setGo] = useState(false);
  const spec = '### OAuth 2.0 Authorization\n\nAcceptance Criteria\n- Authorization code + PKCE\n- JWT refresh auto-rotation\n- RBAC guard middleware\n\nPriority: High · Estimate: 5 SP';
  const { shown, done } = useTyped(go ? spec : '', 14, go);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: t.text }}>Task: OAuth 2.0 Login</span>
        <button onClick={() => setGo(true)} style={{ padding: '6px 14px', borderRadius: 8, backgroundColor: '#F59E0B', color: '#FFF', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Generate ✨</button>
      </div>
      <div style={{ ...card(t), padding: 14, minHeight: 140, fontSize: 12, color: t.text, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {go ? <>{shown}{!done && <span style={{ color: '#F59E0B' }}>▌</span>}</> : <span style={{ color: t.textMuted }}>Click Generate — AI drafts title, acceptance criteria, priority and estimate.</span>}
      </div>
    </div>
  );
}

// ===========================================================================
// AI SMART SUGGESTIONS — accept AI proposals that apply to the task
// ===========================================================================
function SuggestionsDemo({ t }: { t: DemoTheme }) {
  const [applied, setApplied] = useState<Record<string, string>>({});
  const sugg = [
    { k: 'assignee', label: 'Assign to Backend Team', val: 'Backend Team' },
    { k: 'points', label: 'Estimate 5 Story Points', val: '5 SP' },
    { k: 'priority', label: 'Raise priority to High', val: 'High' },
  ];
  return (
    <div>
      <div style={{ ...card(t), padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.text }}>Fix Login Bug</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
          {Object.keys(applied).length === 0 ? 'Unassigned · No estimate · Priority: Medium' :
            `${applied.assignee || 'Unassigned'} · ${applied.points || 'No estimate'} · Priority: ${applied.priority || 'Medium'}`}
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#8B5CF6', textTransform: 'uppercase', marginBottom: 8 }}>AI suggestions</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sugg.map((s) => {
          const on = applied[s.k] !== undefined;
          return (
            <div key={s.k} style={{ ...card(t), padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={13} color="#8B5CF6" />{s.label}</span>
              <button onClick={() => setApplied((p) => ({ ...p, [s.k]: s.val }))} disabled={on} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: on ? 'default' : 'pointer', fontSize: 11, fontWeight: 800, backgroundColor: on ? 'rgba(16,185,129,0.15)' : '#8B5CF6', color: on ? '#10B981' : '#FFF' }}>
                {on ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={12} /> Applied</span> : 'Apply'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// CALENDAR VIEW — month grid, click a day to see its tasks
// ===========================================================================
const CAL_TASKS: Record<number, { title: string; color: string }[]> = {
  8: [{ title: 'OAuth review', color: '#3B82F6' }],
  12: [{ title: 'Sprint planning', color: '#8B5CF6' }, { title: 'Billing sync', color: '#EC4899' }],
  18: [{ title: 'Release v2.4', color: '#10B981' }],
  24: [{ title: 'Retro', color: '#F59E0B' }],
};
function CalendarDemo({ t }: { t: DemoTheme }) {
  const [sel, setSel] = useState(12);
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 8 }}>July 2026</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} style={{ fontSize: 9, textAlign: 'center', color: t.textMuted, fontWeight: 800 }}>{d}</div>)}
          {days.map((d) => {
            const has = CAL_TASKS[d];
            return (
              <button key={d} onClick={() => setSel(d)} style={{ aspectRatio: '1', borderRadius: 6, border: `1px solid ${sel === d ? '#3B82F6' : t.border}`, backgroundColor: sel === d ? 'rgba(59,130,246,0.15)' : t.cardBg, color: t.text, fontSize: 10, fontWeight: 700, cursor: 'pointer', position: 'relative', padding: 0 }}>
                {d}
                {has && <span style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2 }}>{has.slice(0, 2).map((x, i) => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: x.color }} />)}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ ...card(t), padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: t.text, marginBottom: 8 }}>Jul {sel}</div>
        {(CAL_TASKS[sel] || []).map((x, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.text, marginBottom: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: x.color }} />{x.title}</div>
        ))}
        {!CAL_TASKS[sel] && <div style={{ fontSize: 11, color: t.textMuted }}>No tasks scheduled</div>}
      </div>
    </div>
  );
}

// ===========================================================================
// TEAM WORKLOAD — capacity bars, click to rebalance an overloaded member
// ===========================================================================
function WorkloadDemo({ t }: { t: DemoTheme }) {
  const [load, setLoad] = useState([
    { name: 'Phong', pts: 28, cap: 20, color: '#3B82F6' },
    { name: 'Duc', pts: 12, cap: 20, color: '#8B5CF6' },
    { name: 'Khoa', pts: 18, cap: 20, color: '#10B981' },
  ]);
  const rebalance = () => setLoad([{ name: 'Phong', pts: 20, cap: 20, color: '#3B82F6' }, { name: 'Duc', pts: 20, cap: 20, color: '#8B5CF6' }, { name: 'Khoa', pts: 18, cap: 20, color: '#10B981' }]);
  const over = load.some((m) => m.pts > m.cap);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: t.text }}>Team capacity (SP)</span>
        {over && <button onClick={rebalance} style={{ padding: '5px 12px', borderRadius: 8, backgroundColor: '#8B5CF6', color: '#FFF', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>AI rebalance ✨</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {load.map((m) => {
          const pct = Math.min(140, (m.pts / m.cap) * 100);
          const ov = m.pts > m.cap;
          return (
            <div key={m.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: t.text, fontWeight: 700 }}>{m.name}</span>
                <span style={{ color: ov ? '#EF4444' : t.textMuted, fontWeight: 700 }}>{m.pts}/{m.cap} {ov ? '· overloaded' : ''}</span>
              </div>
              <div style={{ height: 10, borderRadius: 6, backgroundColor: t.innerBg, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', backgroundColor: ov ? '#EF4444' : m.color, transition: 'width 400ms ease, background-color 300ms ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// DOCS MANAGEMENT — toggle rich-text formatting on a live doc
// ===========================================================================
function DocsDemo({ t }: { t: DemoTheme }) {
  const [fmt, setFmt] = useState<{ b: boolean; i: boolean; h: boolean; l: boolean }>({ b: true, i: false, h: true, l: true });
  const tools = [
    { k: 'h', icon: <Heading size={14} /> }, { k: 'b', icon: <Bold size={14} /> },
    { k: 'i', icon: <Italic size={14} /> }, { k: 'l', icon: <ListIcon size={14} /> },
  ] as const;
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {tools.map((tl) => (
          <button key={tl.k} onClick={() => setFmt((f) => ({ ...f, [tl.k]: !f[tl.k] }))} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${t.border}`, cursor: 'pointer', backgroundColor: (fmt as any)[tl.k] ? '#3B82F6' : t.cardBg, color: (fmt as any)[tl.k] ? '#FFF' : t.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tl.icon}</button>
        ))}
      </div>
      <div style={{ ...card(t), padding: 14, minHeight: 130 }}>
        {fmt.h && <div style={{ fontSize: fmt.h ? 16 : 13, fontWeight: 900, color: t.text, marginBottom: 8 }}>Authentication Flow</div>}
        <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, fontWeight: fmt.b ? 700 : 400, fontStyle: fmt.i ? 'italic' : 'normal' }}>
          The OAuth 2.0 service issues short-lived JWTs with refresh rotation.
        </div>
        {fmt.l && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: t.textMuted, lineHeight: 1.8 }}>
            <li>Authorization code + PKCE</li><li>Refresh token rotation</li><li>RBAC middleware guard</li>
          </ul>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// ORGANIZATION MANAGEMENT — switcher with live KPI counters
// ===========================================================================
function OrgDemo({ t }: { t: DemoTheme }) {
  const orgs = [
    { name: 'abg team', teams: 12, projects: 48, members: 96 },
    { name: 'acme corp', teams: 7, projects: 23, members: 54 },
    { name: 'nova labs', teams: 3, projects: 9, members: 18 },
  ];
  const [i, setI] = useState(0);
  const o = orgs[i];
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {orgs.map((org, idx) => (
          <button key={org.name} onClick={() => setI(idx)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: `1px solid ${i === idx ? '#3B82F6' : t.border}`, backgroundColor: i === idx ? '#3B82F6' : t.cardBg, color: i === idx ? '#FFF' : t.textMuted }}>{org.name} {i === idx ? '▾' : ''}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[{ l: 'Teams', v: o.teams }, { l: 'Projects', v: o.projects }, { l: 'Members', v: o.members }].map((k) => (
          <div key={k.l} className="trella-fade-up" style={{ ...card(t), padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#3B82F6' }}>{k.v}</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>{k.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// MEMBER & PERMISSIONS — change roles inline
// ===========================================================================
const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'];
function PermissionsDemo({ t }: { t: DemoTheme }) {
  const [members, setMembers] = useState([
    { name: 'Phong Duc', role: 0, color: '#3B82F6' },
    { name: 'Khoa Le', role: 2, color: '#8B5CF6' },
    { name: 'An Nguyen', role: 2, color: '#EC4899' },
  ]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map((m, i) => (
        <div key={m.name} style={{ ...card(t), padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: m.color, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.name[0]}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: t.text }}>{m.name}</span>
          <div style={{ position: 'relative' }}>
            <select value={m.role} onChange={(e) => setMembers((p) => p.map((x, j) => (j === i ? { ...x, role: +e.target.value } : x)))} style={{ appearance: 'none', padding: '4px 24px 4px 10px', borderRadius: 6, border: `1px solid ${t.border}`, backgroundColor: t.innerBg, color: t.text, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
              {ROLES.map((r, ri) => <option key={r} value={ri}>{r}</option>)}
            </select>
            <ChevronDown size={12} color={t.textMuted} style={{ position: 'absolute', right: 7, top: 8, pointerEvents: 'none' }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>Role changes persist instantly to the database.</div>
    </div>
  );
}

// ===========================================================================
// DISPATCHER — one unique demo per feature id
// ===========================================================================
const DEMOS: Record<string, (t: DemoTheme) => React.ReactNode> = {
  'jira-scrum-sync': (t) => <SyncDemo t={t} />,
  'ai-search': (t) => <SearchDemo t={t} />,
  'ai-chat': (t) => <ChatDemo t={t} />,
  'ai-description': (t) => <DescriptionDemo t={t} />,
  'ai-sprint-summary': (t) => <SummaryDemo t={t} />,
  'ai-suggestions': (t) => <SuggestionsDemo t={t} />,
  'backlog-management': (t) => <BacklogDemo t={t} />,
  'sprint-planning': (t) => <PlanningDemo t={t} />,
  'board-kanban': (t) => <KanbanDemo t={t} />,
  'timeline-gantt': (t) => <GanttDemo t={t} />,
  'calendar-view': (t) => <CalendarDemo t={t} />,
  'team-workload': (t) => <WorkloadDemo t={t} />,
  'docs-management': (t) => <DocsDemo t={t} />,
  'reports-analytics': (t) => <ReportsDemo t={t} />,
  'organization-management': (t) => <OrgDemo t={t} />,
  'member-permissions': (t) => <PermissionsDemo t={t} />,
};

export function hasFeatureDemo(id: string): boolean {
  return id in DEMOS;
}

export function FeatureDemo({ id, t }: { id: string; t: DemoTheme }) {
  return <>{DEMOS[id]?.(t) ?? null}</>;
}

// ===========================================================================
// CARD THUMBNAILS — small static preview shown on each feature matrix card
// ===========================================================================
type ThumbKind = 'board' | 'chart' | 'gantt' | 'ai' | 'calendar' | 'docs' | 'sync' | 'people';
const THUMB_KIND: Record<string, ThumbKind> = {
  'board-kanban': 'board', 'backlog-management': 'board', 'sprint-planning': 'board', 'team-workload': 'chart',
  'reports-analytics': 'chart', 'ai-sprint-summary': 'chart',
  'timeline-gantt': 'gantt',
  'ai-search': 'ai', 'ai-chat': 'ai', 'ai-description': 'ai', 'ai-suggestions': 'ai',
  'calendar-view': 'calendar', 'docs-management': 'docs',
  'jira-scrum-sync': 'sync',
  'organization-management': 'people', 'member-permissions': 'people',
};

export function CardThumb({ id, t }: { id: string; t: DemoTheme }) {
  const kind = THUMB_KIND[id] ?? 'board';
  const box: React.CSSProperties = { height: 78, borderRadius: 10, border: `1px solid ${t.border}`, background: t.isDark ? 'linear-gradient(135deg,#0F172A,#131c31)' : 'linear-gradient(135deg,#F8FAFC,#EEF2FF)', padding: 8, marginBottom: 12, overflow: 'hidden' };
  const chip = (w: number | string, c = t.textMuted) => <div style={{ height: 5, width: w, borderRadius: 3, backgroundColor: c, opacity: 0.5 }} />;

  if (kind === 'board') {
    return (
      <div style={{ ...box, display: 'flex', gap: 6 }}>
        {['#F59E0B', '#3B82F6', '#10B981'].map((c) => (
          <div key={c} style={{ flex: 1, backgroundColor: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff', borderRadius: 6, padding: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: c }} />
            <div style={{ backgroundColor: t.isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderRadius: 4, height: 16 }} />
            <div style={{ backgroundColor: t.isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderRadius: 4, height: 16 }} />
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'chart') {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'flex-end', gap: 5 }}>
        {[40, 65, 30, 80, 55, 90].map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 3, background: 'linear-gradient(180deg,#8B5CF6,#3B82F6)', opacity: 0.85 }} />
        ))}
      </div>
    );
  }
  if (kind === 'gantt') {
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        {[{ l: 6, w: 40, c: '#3B82F6' }, { l: 28, w: 34, c: '#8B5CF6' }, { l: 46, w: 44, c: '#10B981' }].map((b, i) => (
          <div key={i} style={{ position: 'relative', height: 12 }}>
            <div style={{ position: 'absolute', left: `${b.l}%`, width: `${b.w}%`, height: 12, borderRadius: 4, backgroundColor: b.c }} />
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'ai') {
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} color="#8B5CF6" />{chip(70, '#8B5CF6')}</div>
        {chip('90%')}{chip('60%')}
      </div>
    );
  }
  if (kind === 'calendar') {
    return (
      <div style={{ ...box, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, alignContent: 'center' }}>
        {Array.from({ length: 21 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: '1', borderRadius: 3, backgroundColor: [4, 9, 15].includes(i) ? '#3B82F6' : t.isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0' }} />
        ))}
      </div>
    );
  }
  if (kind === 'docs') {
    return (
      <div style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        <div style={{ height: 7, width: '55%', borderRadius: 3, backgroundColor: t.text, opacity: 0.55 }} />
        {chip('95%')}{chip('88%')}{chip('70%')}
      </div>
    );
  }
  if (kind === 'sync') {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>{chip('100%', '#8B5CF6')}{chip('80%')}</div>
        <RefreshCw size={16} color="#3B82F6" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>{chip('100%', '#10B981')}{chip('80%')}</div>
      </div>
    );
  }
  // people
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 8 }}>
      {['#3B82F6', '#8B5CF6', '#EC4899', '#10B981'].map((c, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: c }} />
          {chip('80%')}
        </div>
      ))}
    </div>
  );
}
