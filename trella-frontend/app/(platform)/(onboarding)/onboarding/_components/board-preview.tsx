'use client';

import React from 'react';
import { token } from '@atlaskit/tokens';
import type { ProjectType } from './onboarding-wizard';

interface BoardPreviewProps {
  name: string;
  projectType: ProjectType;
  activeTab: 'Board' | 'List' | 'Timeline' | 'Backlog';
  workTypes?: string[];
  statuses?: string[];
  showAvatars?: boolean;
}

const WORK_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  Task: { icon: '☑', color: '#0052CC' },
  Story: { icon: '🔖', color: '#00875A' },
  Feature: { icon: '💰', color: '#6554C0' },
  Request: { icon: '➕', color: '#FF991F' },
  Bug: { icon: '🐛', color: '#DE350B' },
};

const STATUS_COLORS = ['#0052CC', '#FF991F', '#00875A', '#6554C0', '#DE350B'];

export function BoardPreview({ name, projectType, activeTab, workTypes, statuses, showAvatars }: BoardPreviewProps) {
  const tabs = projectType === 'kanban'
    ? ['Board', 'List']
    : ['Board', 'List', 'Timeline', 'Backlog'];

  const displayStatuses = statuses ?? ['To Do', 'In Progress', 'Done'];
  const displayWorkTypes = workTypes ?? ['Task', 'Story'];

  return (
    <div style={{
      backgroundColor: 'white', borderRadius: 8, padding: 16, width: 300, minHeight: 200,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#172B4D' }}>{name}</div>
          {showAvatars && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              {['#0052CC', '#6554C0'].map((c, i) => (
                <div key={i} style={{
                  width: 18, height: 18, borderRadius: '50%', backgroundColor: c,
                  border: '2px solid white', marginLeft: i > 0 ? -6 : 0,
                }} />
              ))}
              <div style={{
                width: 18, height: 18, borderRadius: '50%', backgroundColor: '#F4F5F7',
                border: '2px solid white', marginLeft: -6, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#666',
              }}>+</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #E8ECF0', paddingBottom: 6 }}>
          {tabs.map(tab => (
            <span key={tab} style={{
              fontSize: 10, fontWeight: 500, paddingBottom: 6, marginBottom: -7,
              borderBottom: tab === activeTab ? '2px solid #0052CC' : 'none',
              color: tab === activeTab ? '#0052CC' : '#666',
              cursor: 'pointer',
            }}>{tab}</span>
          ))}
        </div>
      </div>

      {/* Board view */}
      {activeTab === 'Board' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {displayStatuses.slice(0, 4).map((status, i) => (
            <div key={status} style={{ flex: 1 }}>
              <div style={{
                fontSize: 8, fontWeight: 700, color: STATUS_COLORS[i % STATUS_COLORS.length],
                textTransform: 'uppercase', marginBottom: 4,
              }}>{status.toUpperCase().slice(0, 8)}</div>
              {[0.9, 0.6].map((op, j) => (
                <div key={j} style={{
                  height: 20, borderRadius: 3, marginBottom: 3,
                  backgroundColor: '#F4F5F7',
                  border: '1px solid #E8ECF0',
                  opacity: op,
                  display: 'flex', alignItems: 'center', padding: '0 4px',
                }}>
                  <div style={{ height: 6, borderRadius: 2, backgroundColor: '#DDD', flex: 1 }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* List view (work types) */}
      {activeTab === 'List' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {displayWorkTypes.slice(0, 5).map((wt, i) => {
            const info = WORK_TYPE_ICONS[wt] ?? { icon: '•', color: '#666' };
            return (
              <div key={wt} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 4px', borderRadius: 3,
                backgroundColor: '#F4F5F7',
              }}>
                <span style={{ fontSize: 10, color: info.color }}>{info.icon}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 2, backgroundColor: '#DDD' }} />
                <div style={{ height: 6, width: 30, borderRadius: 2, backgroundColor: '#E8ECF0' }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
