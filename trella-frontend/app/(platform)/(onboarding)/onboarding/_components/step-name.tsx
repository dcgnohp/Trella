'use client';

import React from 'react';
import type { ProjectType } from './onboarding-wizard';

const EXAMPLES = ['My Software Team', 'Team Astro', 'Front-End Dev', 'QA Testing', 'Bug Tracking'];

interface StepNameProps {
  value: string;
  projectType: ProjectType;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepName({ value, projectType, onChange, onNext, onBack }: StepNameProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1f2e', color: '#e2e8f0' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>Name your space</h2>
          <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 32 }}>
            This is where you&apos;ll help your team track progress, stay organized, and manage tasks.
          </p>

          <label style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: 6 }}>
            Project name
          </label>
          <input
            value={value}
            autoFocus
            onChange={e => onChange(e.target.value)}
            placeholder="e.g. My Software Team"
            style={{
              width: '100%', background: '#161b27', border: '1px solid #374151', borderRadius: 6,
              padding: '10px 12px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />

          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 16, marginBottom: 8 }}>Try one of these:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => onChange(ex)} style={{
                padding: '5px 14px', borderRadius: 999,
                border: `1px solid ${value === ex ? '#3b82f6' : '#374151'}`,
                background: value === ex ? '#1d4ed8' : 'transparent',
                color: value === ex ? '#fff' : '#94a3b8',
                cursor: 'pointer', fontSize: 13,
              }}>{ex}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
            <button onClick={onBack} style={{
              background: 'none', border: '1px solid #374151', borderRadius: 6, color: '#e2e8f0',
              fontSize: 14, cursor: 'pointer', padding: '8px 20px',
            }}>Back</button>
            <button onClick={onNext} disabled={!value.trim()} style={{
              background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6,
              padding: '8px 24px', fontSize: 14, fontWeight: 500, cursor: value.trim() ? 'pointer' : 'not-allowed',
              opacity: value.trim() ? 1 : 0.5,
            }}>Continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}
