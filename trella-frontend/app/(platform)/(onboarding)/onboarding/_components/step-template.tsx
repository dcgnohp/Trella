'use client';

import React, { useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { ProjectType } from './onboarding-wizard';

/* ---- Work type icons ---- */
function WtIcon({ type }: { type: string }) {
  if (type === 'Epic') return <span style={{ background: '#7c3aed', borderRadius: 4, padding: '1px 4px', fontSize: 12 }}>⚡</span>;
  if (type === 'Story') return <span style={{ background: '#16a34a', borderRadius: 4, padding: '1px 4px', fontSize: 12 }}>🔖</span>;
  if (type === 'Bug') return <span style={{ background: '#dc2626', borderRadius: 4, padding: '1px 4px', fontSize: 12 }}>🐛</span>;
  if (type === 'Task') return <span style={{ background: '#2563eb', borderRadius: 4, padding: '1px 4px', fontSize: 12 }}>☑</span>;
  if (type === 'Sub-task') return <span style={{ background: '#0284c7', borderRadius: 4, padding: '1px 4px', fontSize: 12 }}>↳</span>;
  return <span style={{ background: '#374151', borderRadius: 4, padding: '1px 4px', fontSize: 12 }}>•</span>;
}

/* ---- Kanban feature block illustrations ---- */
function KanbanBoardIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80">
      {[0, 40, 80].map((x, col) => (
        <g key={col}>
          <rect x={x + 4} y="4" width="34" height="4" rx="2" fill={['#3b82f6','#6b7280','#6b7280'][col]} opacity="0.8"/>
          {[12,20,28,36].slice(0, 3 - col + 2).map((y, i) => (
            <rect key={i} x={x + 4} y={y} width="34" height="6" rx="2" fill="#374151" stroke="#4b5563" strokeWidth="0.5"/>
          ))}
        </g>
      ))}
    </svg>
  );
}
function WipIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80">
      {[10, 45, 80].map((x, i) => (
        <g key={i}>
          <rect x={x} y="10" width="30" height="50" rx="2" fill="#1e2535" stroke="#374151"/>
          <rect x={x} y="10" width="30" height={[30, 20, 45][i]} rx="2" fill={['#3b82f6','#22c55e','#6b7280'][i]} opacity="0.7"/>
        </g>
      ))}
      {[10, 45, 80].map((x, i) => (
        <g key={`h-${i}`}>
          <line x1={x} y1={[40,30,55][i]} x2={x+30} y2={[40,30,55][i]} stroke="#ef4444" strokeWidth="1" strokeDasharray="3"/>
          <circle cx={x+5} cy="72" r="5" fill="#374151" stroke="#4b5563"/>
          <line x1={x+10} y1="72" x2={x+28} y2="72" stroke="#6b7280" strokeWidth="2"/>
        </g>
      ))}
    </svg>
  );
}
function ReportsIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80">
      <rect x="10" y="8" width="100" height="64" rx="4" fill="#1e2535" stroke="#374151"/>
      <polyline points="20,60 35,45 50,50 65,30 80,35 100,15" stroke="#3b82f6" strokeWidth="2" fill="none"/>
      <polyline points="20,65 35,55 50,60 65,45 80,50 100,35" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.7"/>
      <line x1="20" y1="65" x2="100" y2="65" stroke="#4b5563" strokeWidth="0.5"/>
    </svg>
  );
}
/* ---- Scrum illustrations ---- */
function BacklogIllustration() {
  return (
    <svg width="120" height="90" viewBox="0 0 120 90">
      {[0,1,2].map(i => (
        <g key={i} transform={`translate(0, ${i * 24})`}>
          <rect x="10" y="8" width="100" height="18" rx="3" fill="#1e2535" stroke="#374151"/>
          <rect x="15" y="14" width="10" height="6" rx="1" fill={['#2563eb','#16a34a','#16a34a'][i]}/>
          <rect x="30" y="15" width="40" height="4" rx="1" fill="#374151"/>
          <rect x="75" y="13" width="20" height="8" rx="8" fill="#374151"/>
        </g>
      ))}
      <rect x="10" y="80" width="100" height="8" rx="1" fill="#374151" opacity="0.5"/>
    </svg>
  );
}
function SprintIllustration() {
  return (
    <svg width="120" height="90" viewBox="0 0 120 90">
      <rect x="20" y="15" width="80" height="60" rx="8" fill="#1e2535" stroke="#374151"/>
      <path d="M60 30 A20 20 0 1 1 40 50" stroke="#3b82f6" strokeWidth="4" fill="none" strokeLinecap="round"/>
      <path d="M55 20 L60 30 L70 25" stroke="#3b82f6" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <polygon points="75,55 95,55 95,70 75,70" fill="#22c55e" opacity="0.8"/>
      <polygon points="95,55 108,62 95,70" fill="#22c55e"/>
    </svg>
  );
}
function VelocityIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80">
      <rect x="10" y="8" width="100" height="64" rx="4" fill="#1e2535" stroke="#374151"/>
      {[15,30,45,60,75].map((x, i) => (
        <rect key={i} x={x} y={68 - [30,42,20,50,35][i]} width="12" height={[30,42,20,50,35][i]} rx="2" fill="#22c55e" opacity={0.6 + i * 0.08}/>
      ))}
      <line x1="12" y1="68" x2="108" y2="68" stroke="#4b5563" strokeWidth="0.5"/>
    </svg>
  );
}

const WORK_TYPES = ['Epic', 'Story', 'Bug', 'Task', 'Sub-task'];
const STATUS_CHIPS: { label: string; bg: string; color: string }[] = [
  { label: 'TO DO', bg: '#374151', color: '#e5e7eb' },
  { label: 'IN PROGRESS', bg: '#1d4ed8', color: '#fff' },
  { label: 'DONE', bg: '#15803d', color: '#fff' },
];

interface ModalProps {
  type: 'kanban' | 'scrum';
  onClose: () => void;
  onUse: () => void;
}

function TemplateModal({ type, onClose, onUse }: ModalProps) {
  const isKanban = type === 'kanban';

  const features = isKanban ? [
    {
      img: <KanbanBoardIllustration />,
      imgSide: 'left' as const,
      heading: 'Track work using a simple board',
      body: 'Work items are represented visually on your kanban board, allowing teams to track the status of work at any time. The columns on your board represent each step in your team\'s workflow, from to-do to done.',
      link: 'Learn more about kanban boards',
    },
    {
      img: <WipIllustration />,
      imgSide: 'right' as const,
      heading: 'Use the board to limit work in progress',
      body: 'Set the maximum amount of work that can exist in each status with work in progress (WIP) limits. By limiting work in progress, you can improve team focus, and better identify inefficiencies and bottlenecks.',
      link: 'Learn more about WIP limits',
    },
    {
      img: <ReportsIllustration />,
      imgSide: 'left' as const,
      heading: 'Continuously improve with agile reports',
      body: 'One of the key tenets of kanban is optimizing flow for continuous delivery. Agile reports, like the cumulative flow diagram, help ensure your team are consistently delivering maximum value back to your business.',
      link: 'Learn more about agile metrics',
    },
  ] : [
    {
      img: <BacklogIllustration />,
      imgSide: 'left' as const,
      heading: 'Plan upcoming work in a backlog',
      body: 'Prioritize and plan your team\'s work on the backlog. Break down work from your project timeline, and order work items so your team knows what to deliver first.',
      link: 'Learn more about the backlog',
    },
    {
      img: <SprintIllustration />,
      imgSide: 'right' as const,
      heading: 'Organize cycles of work into sprints',
      body: 'Sprints are short, time-boxed periods when a team collaborates to complete a set amount of customer value. Use sprints to drive incremental delivery, allow your team to ship high-quality work and deliver value faster.',
      link: 'Learn more about sprints',
    },
    {
      img: <VelocityIllustration />,
      imgSide: 'left' as const,
      heading: 'Understand your team\'s velocity',
      body: 'Improve predictability on planning and delivery with out-of-the-box reports, including the sprint report and velocity chart. Empower your team to understand their capacity and iterate on their processes.',
      link: 'Learn more about agile metrics',
    },
  ];

  const description = isKanban
    ? "Kanban (the Japanese word for 'visual signal') is all about helping teams visualize their work, limit work currently in progress, and maximize efficiency. Use the Kanban template to increase planning flexibility, reduce bottlenecks and promote transparency throughout the development cycle."
    : "The Scrum template helps teams work together using sprints to break down large, complex projects into bite-sized pieces of value. Encourage your team to learn through incremental delivery, self-organize while working on a problem, and regularly reflect on their wins and losses to continuously improve.";

  const recommendedFor = isKanban
    ? ['Teams that control work volume from a backlog', 'DevOps teams that want to connect work across their tools']
    : ['Teams that deliver work on a regular cadence', 'DevOps teams that want to connect work across their tools'];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#161b27', borderRadius: 12, width: '100%', maxWidth: 900,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 80px rgba(0,0,0,0.8)', overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 28px 0' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>{isKanban ? 'Kanban' : 'Scrum'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
          {/* left content */}
          <div style={{ flex: 1, padding: '16px 28px 28px', borderRight: '1px solid #2d3748' }}>
            <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 28 }}>{description}</p>

            {features.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 20, marginBottom: 32, flexDirection: f.imgSide === 'right' ? 'row-reverse' : 'row', alignItems: 'center' }}>
                <div style={{ flexShrink: 0 }}>{f.img}</div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>{f.heading}</h3>
                  <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 8 }}>{f.body}</p>
                  <a href="#" style={{ color: '#3b82f6', fontSize: 13, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {f.link} <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* right sidebar */}
          <div style={{ width: 260, padding: '20px 24px', flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Product</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #0052CC, #6554C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'white', fontWeight: 700 }}>J</div>
              <span style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>Jira</span>
            </div>

            <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Recommended for</p>
            {recommendedFor.map((r, i) => (
              <p key={i} style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 6 }}>{r}</p>
            ))}

            <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>Work types</p>
            {WORK_TYPES.map(wt => (
              <div key={wt} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <WtIcon type={wt} />
                <span style={{ fontSize: 13, color: '#e2e8f0' }}>{wt}</span>
              </div>
            ))}

            <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>Workflow</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_CHIPS.map(s => (
                <span key={s.label} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: s.bg, color: s.color }}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ borderTop: '1px solid #2d3748', padding: '16px 28px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onUse} style={{
            background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6,
            padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>
            Use template
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- main component ---- */
interface StepTemplateProps {
  value: ProjectType;
  onChange: (type: ProjectType) => void;
  onNext: () => void;
}

export function StepTemplate({ value, onChange, onNext }: StepTemplateProps) {
  const [modal, setModal] = useState<null | 'kanban' | 'scrum'>(null);

  const openModal = (e: React.MouseEvent, type: 'kanban' | 'scrum') => {
    e.stopPropagation();
    setModal(type);
  };

  const applyTemplate = (type: 'kanban' | 'scrum') => {
    onChange(type);
    setModal(null);
    onNext();
  };

  const TEMPLATES = [
    {
      type: 'kanban' as ProjectType,
      title: 'Kanban',
      description: 'Visualize work and maximize efficiency with a kanban board',
      hasModal: true,
    },
    {
      type: 'scrum' as ProjectType,
      title: 'Scrum',
      description: 'Plan, prioritize, and schedule sprints using scrum framework',
      hasModal: true,
    },
    {
      type: 'project-management' as ProjectType,
      title: 'Project management',
      description: 'Manage and track agile work plus integrate developer tools',
      hasModal: false,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1f2e', color: '#e2e8f0' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: '#f1f5f9', textAlign: 'center', marginBottom: 8 }}>
          Select a template to get started
        </h2>
        <p style={{ fontSize: 15, color: '#94a3b8', textAlign: 'center', marginBottom: 40, maxWidth: 600 }}>
          You can always change this later. Selecting a template won&apos;t limit what you can do.
        </p>

        <div style={{
          border: '1px solid #2d3748', borderRadius: 12, background: '#161b27',
          padding: 32, width: '100%', maxWidth: 900,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            <span style={{ fontSize: 20 }}>🧑‍💻</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>Software development</span>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {TEMPLATES.map(tpl => (
              <div
                key={tpl.type}
                onClick={() => onChange(tpl.type)}
                style={{
                  flex: 1, cursor: 'pointer', borderRadius: 8,
                  border: `2px solid ${value === tpl.type ? '#3b82f6' : '#2d3748'}`,
                  padding: 16, background: value === tpl.type ? '#1e2535' : '#0f1420',
                  transition: 'all 0.15s ease',
                }}
              >
                <p style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>{tpl.title}</p>
                <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 12 }}>{tpl.description}</p>
                {tpl.hasModal && (
                  <button
                    onClick={e => openModal(e, tpl.type as 'kanban' | 'scrum')}
                    style={{
                      background: 'none', border: '1px solid #374151', borderRadius: 4,
                      color: '#60a5fa', fontSize: 12, cursor: 'pointer', padding: '4px 10px',
                    }}
                  >
                    View details
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onNext}
          style={{
            marginTop: 32, background: '#3b82f6', color: 'white', border: 'none',
            borderRadius: 6, padding: '10px 32px', fontSize: 15, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </div>

      {modal && (
        <TemplateModal
          type={modal}
          onClose={() => setModal(null)}
          onUse={() => applyTemplate(modal)}
        />
      )}
    </div>
  );
}
