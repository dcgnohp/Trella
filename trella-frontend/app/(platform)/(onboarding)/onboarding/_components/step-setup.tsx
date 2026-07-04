'use client';

import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Lock, ChevronDown, Trash2, GripVertical, Plus, Info } from 'lucide-react';
import type { OnboardingData, WorkTypeItem, StatusItem } from './onboarding-wizard';

/* ---- work type icon set ---- */
function WorkTypeIcon({ typeKey }: { typeKey: string }) {
  const k = typeKey.toUpperCase();
  if (k === 'TASK') return <span style={{ color: '#3b82f6', fontSize: 16 }}>☑</span>;
  if (k === 'STORY') return <span style={{ color: '#22c55e', fontSize: 16 }}>🔖</span>;
  if (k === 'FEATURE') return <span style={{ color: '#22c55e', fontSize: 16 }}>💰</span>;
  if (k === 'BUG') return <span style={{ color: '#ef4444', fontSize: 16 }}>🐛</span>;
  if (k === 'EPIC') return <span style={{ color: '#a855f7', fontSize: 16 }}>⚡</span>;
  return <span style={{ color: '#6b7280', fontSize: 16 }}>•</span>;
}

/* ---- squiggly placeholder SVG ---- */
function Squiggly() {
  return (
    <svg width="80" height="14" viewBox="0 0 80 14" fill="none">
      <path d="M2 9 Q10 3 18 9 Q26 15 34 9 Q42 3 50 9 Q58 15 66 9 Q74 3 78 7" stroke="#4b5563" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

/* ---- board preview card ---- */
function PreviewCard({ typeKey, taskKey, colIndex }: { typeKey: string; taskKey: string; colIndex: number }) {
  return (
    <div style={{
      background: '#1e2535', borderRadius: 8, padding: '10px 10px 8px',
      marginBottom: 6, border: '1px solid #2d3748',
    }}>
      <Squiggly />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b82ff' }}>
          <WorkTypeIcon typeKey={typeKey} />
          {taskKey}
        </span>
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#374151' }} />
      </div>
    </div>
  );
}

/* ---- list row ---- */
function PreviewListRow({ typeKey, taskKey, status, statusColor }: {
  typeKey: string; taskKey: string; status: string; statusColor: string;
}) {
  return (
    <tr>
      <td style={{ padding: '6px 8px' }}><input type="checkbox" style={{ accentColor: '#3b82f6' }} /></td>
      <td style={{ padding: '6px 8px', textAlign: 'center' }}><WorkTypeIcon typeKey={typeKey} /></td>
      <td style={{ padding: '6px 8px', color: '#6b82ff', fontSize: 12 }}>{taskKey}</td>
      <td style={{ padding: '6px 8px' }}>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid ' + statusColor,
          color: statusColor, whiteSpace: 'nowrap',
        }}>{status}</span>
      </td>
      <td style={{ padding: '6px 8px' }}><Squiggly /></td>
    </tr>
  );
}

/* ---- views config per template ---- */
const SCRUM_VIEWS = [
  { name: 'List', locked: true }, { name: 'Board', locked: true },
  { name: 'Backlog', locked: true }, { name: 'Pages', locked: true },
  { name: 'Forms', locked: true }, { name: 'Development', locked: false },
  { name: 'Summary', locked: false }, { name: 'Timeline', locked: false },
  { name: 'Reports', locked: false }, { name: 'Calendar', locked: false },
  { name: 'Goals', locked: false },
];
const KANBAN_VIEWS = [
  { name: 'List', locked: true }, { name: 'Board', locked: true },
  { name: 'Pages', locked: true }, { name: 'Forms', locked: true },
  { name: 'Development', locked: false }, { name: 'Summary', locked: false },
  { name: 'Timeline', locked: false }, { name: 'Reports', locked: false },
  { name: 'Calendar', locked: false }, { name: 'Goals', locked: false },
];

const STATUS_COLORS = ['#6b82ff', '#f59e0b', '#8b5cf6', '#22c55e'];

interface StepSetupProps {
  data: OnboardingData;
  onUpdate: (partial: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepSetup({ data, onUpdate, onNext, onBack }: StepSetupProps) {
  const [activePreviewTab, setActivePreviewTab] = useState<'Board' | 'List'>('Board');
  const views = data.projectType === 'scrum' ? SCRUM_VIEWS : KANBAN_VIEWS;

  const projectKey = (data.name || 'SA').slice(0, 4).toUpperCase().replace(/\s/g, '');
  const statusColors: Record<string, string> = {
    'To Do': '#6b7280', 'In Progress': '#3b82f6', 'In Review': '#8b5cf6', 'Done': '#22c55e',
  };

  /* work type handlers */
  const updateWorkTypeName = (i: number, name: string) => {
    const next = [...data.workTypes];
    next[i] = { ...next[i], name };
    onUpdate({ workTypes: next });
  };
  const removeWorkType = (i: number) => {
    if (data.workTypes.length <= 1) return;
    onUpdate({ workTypes: data.workTypes.filter((_, idx) => idx !== i) });
  };
  const addWorkType = () => {
    onUpdate({ workTypes: [...data.workTypes, { key: 'TASK', name: 'New type' }] });
  };

  /* status handlers */
  const updateStatusName = (i: number, name: string) => {
    const next = [...data.statuses];
    next[i] = { name };
    onUpdate({ statuses: next });
  };
  const removeStatus = (i: number) => {
    if (data.statuses.length <= 1) return;
    onUpdate({ statuses: data.statuses.filter((_, idx) => idx !== i) });
  };
  const addStatus = () => {
    onUpdate({ statuses: [...data.statuses, { name: 'New Status' }] });
  };
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const next = [...data.statuses];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onUpdate({ statuses: next });
  };

  /* preview columns: first 3 statuses as board columns */
  const previewCols = data.statuses.slice(0, 3);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1f2e', color: '#e2e8f0' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT column — form */}
        <div style={{
          width: 480, minWidth: 480, overflowY: 'auto', padding: '40px 40px 100px',
          borderRight: '1px solid #2d3748',
        }}>
          {/* back link */}
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}
          >
            ← Back to Name your space
          </button>

          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
            Let&apos;s set up your space
          </h2>
          <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
            These form the building blocks of your space. You can change these settings later.
          </p>

          {/* WORK TYPES section */}
          <Section label="Work types" infoTip="Different categories of work items you'll track">
            {data.workTypes.map((wt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <WorkTypeIcon typeKey={wt.key} />
                <input
                  value={wt.name}
                  onChange={e => updateWorkTypeName(i, e.target.value)}
                  style={inputStyle}
                />
                <button onClick={() => removeWorkType(i)} style={iconBtnStyle} disabled={data.workTypes.length <= 1} aria-label="Remove">
                  <Trash2 size={14} color="#6b7280" />
                </button>
              </div>
            ))}
            <GhostBtn icon={<Plus size={14} />} label="Add work type" onClick={addWorkType} />
          </Section>

          {/* STATUSES section */}
          <Section label="Statuses">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="statuses">
                {provided => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {data.statuses.map((s, i) => (
                      <Draggable key={i} draggableId={`status-${i}`} index={i}>
                        {drag => (
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, ...drag.draggableProps.style }}
                          >
                            <span {...drag.dragHandleProps} style={{ cursor: 'grab', color: '#4b5563', display: 'flex' }}>
                              <GripVertical size={16} />
                            </span>
                            <input
                              value={s.name}
                              onChange={e => updateStatusName(i, e.target.value)}
                              style={inputStyle}
                            />
                            <button onClick={() => removeStatus(i)} style={iconBtnStyle} disabled={data.statuses.length <= 1} aria-label="Remove">
                              <Trash2 size={14} color="#6b7280" />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <GhostBtn icon={<Plus size={14} />} label="Add status" onClick={addStatus} />
          </Section>

          {/* VIEWS section */}
          <Section label="Views" infoTip="Navigation tabs visible in your workspace">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {views.map(v => (
                <span key={v.name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 999, border: '1px solid #374151',
                  fontSize: 12, color: '#94a3b8', background: '#1e2535',
                }}>
                  {v.name}
                  {v.locked && <Lock size={10} style={{ opacity: 0.7 }} />}
                </span>
              ))}
            </div>
          </Section>

          {/* sample items toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#94a3b8' }}>
              Start with sample work items
              <Info size={14} style={{ opacity: 0.6 }} />
            </div>
            {/* ponytail: native checkbox styled as toggle */}
            <label style={{ position: 'relative', width: 40, height: 22, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!data.sampleItems}
                onChange={e => onUpdate({ sampleItems: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
              />
              <span style={{
                position: 'absolute', inset: 0, borderRadius: 999,
                background: data.sampleItems ? '#3b82f6' : '#374151',
                transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', top: 3, left: data.sampleItems ? 20 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s',
                }} />
              </span>
            </label>
          </div>
        </div>

        {/* RIGHT column — live preview */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '60px 40px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #0c1a2e 0%, #0d2a4a 40%, #1a1f2e 100%)',
        }}>
          {/* blue diagonal accent lines */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            <div style={{
              position: 'absolute', top: -60, right: -60, width: 400, height: 400,
              border: '2px solid rgba(59,130,246,0.3)', borderRadius: '50%', transform: 'rotate(30deg)',
            }} />
            <div style={{
              position: 'absolute', bottom: -40, left: -40, width: 300, height: 300,
              border: '1px solid rgba(59,130,246,0.2)', borderRadius: '50%',
            }} />
          </div>

          {/* floating card */}
          <div style={{
            background: '#161b27', borderRadius: 16, padding: 0, width: 540,
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden',
            position: 'relative', zIndex: 1,
          }}>
            {/* card header */}
            <div style={{ padding: '16px 20px 0', borderBottom: '1px solid #2d3748' }}>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Team-managed space</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
                {data.name || 'My Project'}
              </p>
              {/* tab bar */}
              <div style={{ display: 'flex', gap: 0 }}>
                {['List', 'Board', 'Timeline', 'More'].map(tab => (
                  <button key={tab} onClick={() => { if (tab === 'List' || tab === 'Board') setActivePreviewTab(tab as 'Board' | 'List'); }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '8px 14px', fontSize: 13, color: activePreviewTab === tab ? '#60a5fa' : '#6b7280',
                      borderBottom: activePreviewTab === tab ? '2px solid #60a5fa' : '2px solid transparent',
                      marginBottom: -1,
                    }}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* avatar row */}
            <div style={{ padding: '12px 20px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#6b7280"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/></svg>
              </div>
            </div>

            {/* BOARD preview */}
            {activePreviewTab === 'Board' && (
              <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, overflowX: 'auto' }}>
                {previewCols.map((col, i) => (
                  <div key={i} style={{ minWidth: 140, flex: 1 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
                      {col.name}
                    </p>
                    <PreviewCard
                      typeKey={data.workTypes[i % data.workTypes.length]?.key ?? 'TASK'}
                      taskKey={`${projectKey}-${i + 1}`}
                      colIndex={i}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* LIST preview */}
            {activePreviewTab === 'List' && (
              <div style={{ padding: '0 20px 20px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2d3748' }}>
                      <th style={{ padding: '6px 8px', width: 28 }}><input type="checkbox" /></th>
                      {['Type', 'Key', 'Status', 'Summary'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', color: '#6b7280', fontWeight: 500, textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.statuses.slice(0, 4).map((s, i) => (
                      <PreviewListRow
                        key={i}
                        typeKey={data.workTypes[i % data.workTypes.length]?.key ?? 'TASK'}
                        taskKey={`${projectKey}-${i + 1}`}
                        status={s.name.toUpperCase()}
                        statusColor={statusColors[s.name] ?? STATUS_COLORS[i % STATUS_COLORS.length]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* scrollbar placeholder */}
            <div style={{ borderTop: '1px solid #2d3748', padding: '6px 20px' }}>
              <div style={{ height: 6, background: '#2d3748', borderRadius: 3 }}>
                <div style={{ height: '100%', width: '30%', background: '#374151', borderRadius: 3 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        borderTop: '1px solid #2d3748', background: '#1a1f2e',
        padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 50,
      }}>
        <span style={{ fontSize: 14, color: '#6b7280' }}>Step 2 of 4</span>
        <button onClick={onNext} style={{
          background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6,
          padding: '8px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}>
          Next
        </button>
      </div>
    </div>
  );
}

/* ---- small helpers ---- */
const inputStyle: React.CSSProperties = {
  flex: 1, background: '#1e2535', border: '1px solid #374151', borderRadius: 4,
  padding: '6px 10px', color: '#e2e8f0', fontSize: 14, outline: 'none',
};
const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
};

function Section({ label, infoTip, children }: { label: string; infoTip?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#161b27', border: '1px solid #2d3748', borderRadius: 8,
      padding: 16, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{label}</span>
        {infoTip && <Info size={14} style={{ color: '#6b7280' }} />}
        <ChevronDown size={16} style={{ marginLeft: 'auto', color: '#6b7280' }} />
      </div>
      {children}
    </div>
  );
}

function GhostBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: '#6b82ff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 0', marginTop: 4,
    }}>
      {icon}{label}
    </button>
  );
}
