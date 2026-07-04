'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { OnboardingData } from './onboarding-wizard';
import { BoardsService, ColumnsService, CustomStatusesService } from '@/lib/client';

interface StepInviteProps {
  data: OnboardingData;
  orgId: string | null;
  onBack: () => void;
}

function toStatusKey(name: string): string {
  const n = name.toLowerCase().trim();
  if (n === 'to do' || n === 'todo') return 'TODO';
  if (n === 'in progress') return 'IN_PROGRESS';
  if (n === 'in review' || n === 'pending') return 'PENDING';
  if (n === 'done' || n === 'complete' || n === 'completed') return 'DONE';
  return 'TODO';
}

export function StepInvite({ data, orgId, onBack }: StepInviteProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Member');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleNext = async () => {
    if (!orgId) { router.push('/organization'); return; }
    setLoading(true);
    try {
      // Map mode
      const mode = data.projectType === 'scrum' ? 'SCRUM' : 'KANBAN';

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`trella:projectType:${orgId}`, data.projectType);
        window.localStorage.setItem(`trella:onboarding:${orgId}`, JSON.stringify({
          name: data.name, workTypes: data.workTypes.map(w => w.name), statuses: data.statuses.map(s => s.name),
        }));
      }

      // Update workspace mode via API
      try {
        await fetch(`/api/v1/workspaces/${orgId}/mode`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
          credentials: 'include',
        });
      } catch { /* non-critical */ }

      // Align custom statuses
      try {
        const existingCs = await CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({ workspaceId: orgId });
        const existingByCanonical: Record<string, typeof existingCs[0]> = {};
        existingCs.forEach(cs => { if (cs.canonicalStatus) existingByCanonical[cs.canonicalStatus.toUpperCase()] = cs; });

        const statusNames = data.statuses.length > 0 ? data.statuses.map(s => s.name) : ['To Do', 'In Progress', 'Done'];
        const activeKeys = new Set(statusNames.map(toStatusKey));

        for (const cs of existingCs) {
          if (cs.canonicalStatus && !activeKeys.has(cs.canonicalStatus.toUpperCase())) {
            await CustomStatusesService.CustomStatuses_customStatusesDeleteCustomStatus({ customStatusId: cs.id }).catch(() => {});
          }
        }
        for (const name of statusNames) {
          const key = toStatusKey(name);
          const existing = existingByCanonical[key];
          if (existing) {
            if (existing.name !== name) {
              await CustomStatusesService.CustomStatuses_customStatusesUpdateCustomStatus({
                customStatusId: existing.id, requestBody: { name, canonicalStatus: key as never },
              }).catch(() => {});
            }
          } else {
            await CustomStatusesService.CustomStatuses_customStatusesCreateCustomStatus({
              workspaceId: orgId, requestBody: { name, color: null, canonicalStatus: key as never },
            }).catch(() => {});
          }
        }
      } catch { /* non-critical */ }

      const boardTitle = data.name || 'My Project';
      const board = await BoardsService.Boards_boardsCreateBoard({ requestBody: { orgId, title: boardTitle } });

      const statusNames = data.statuses.length > 0 ? data.statuses.map(s => s.name) : ['To Do', 'In Progress', 'Done'];
      await Promise.all(
        statusNames.map((name, i) =>
          ColumnsService.Columns_columnsCreateColumn({
            boardId: board.id,
            requestBody: { name, statusKey: toStatusKey(name), position: i },
          })
        )
      );

      if (mode === 'SCRUM') {
        router.push(`/workspaces/${orgId}/backlog`);
      } else {
        router.push(`/workspaces/${orgId}/boards/${board.id}`);
      }
    } catch {
      router.push(`/organization/${orgId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => { void handleNext(); };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1f2e', color: '#e2e8f0' }}>
      {/* main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, paddingBottom: 100, paddingInline: 24 }}>
        {/* heading */}
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9', marginBottom: 10, textAlign: 'center' }}>
          We&apos;re setting up your space...
        </h2>

        {/* progress bar */}
        <div style={{ width: '100%', maxWidth: 500, height: 6, background: '#2d3748', borderRadius: 999, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ width: '70%', height: '100%', background: '#3b82f6', borderRadius: 999 }} />
        </div>

        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 40, textAlign: 'center' }}>
          Get a head start by inviting your team while you wait.
        </p>

        {/* form */}
        <div style={{ width: '100%', maxWidth: 480 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: 6 }}>
            Enter names or emails
          </label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="John Smith"
            style={{
              width: '100%', background: '#161b27', border: '1px solid #374151', borderRadius: 6,
              padding: '10px 12px', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', display: 'block', marginTop: 20, marginBottom: 6 }}>
            Role
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{
                width: '100%', appearance: 'none', background: '#161b27', border: '1px solid #374151',
                borderRadius: 6, padding: '10px 36px 10px 12px', color: '#e2e8f0', fontSize: 14, outline: 'none', cursor: 'pointer',
              }}
            >
              <option>Member</option>
              <option>Admin</option>
              <option>Viewer</option>
            </select>
            <ChevronDown size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} />
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
        <span style={{ fontSize: 14, color: '#6b7280' }}>Step 3 of 4</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleSkip}
            style={{ background: 'none', border: '1px solid #374151', borderRadius: 6, color: '#e2e8f0', fontSize: 14, cursor: 'pointer', padding: '8px 20px' }}
          >
            I&apos;ll do this later
          </button>
          <button
            onClick={handleNext}
            disabled={loading}
            style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, padding: '8px 24px', fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Creating...' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
