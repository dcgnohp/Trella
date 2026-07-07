'use client';

import React, { useState } from 'react';
import { token } from '@atlaskit/tokens';
import Button from '@atlaskit/button/new';
import { Text, Stack, Inline } from '@atlaskit/primitives';
import BoardsIcon from '@atlaskit/icon/core/boards';
import Select from '@atlaskit/select';
import { type PlanWithBoardsPublic } from '@/lib/client';

interface PlanOnboardingProps {
  plan: PlanWithBoardsPublic;
  workspaceId: string;
  onFinish: () => void;
  onSkip: () => void;
}

const STEPS = [
  { id: 'columns', label: 'Add timeline columns', stepNum: 1 },
  { id: 'people', label: 'Add people to the plan', stepNum: 2 },
];

const TIMELINE_COLUMNS = [
  { id: 'status', label: 'Status', icon: '○' },
  { id: 'assignee', label: 'Assignee', icon: '👤' },
  { id: 'start_date', label: 'Start date', icon: '📅' },
  { id: 'due_date', label: 'Due date', icon: '📅' },
  { id: 'priority', label: 'Priority', icon: '≡' },
  { id: 'breakdown', label: 'Breakdown', icon: '⊕' },
  { id: 'team', label: 'Team', icon: '👥' },
];

export function PlanOnboarding({ plan, workspaceId, onFinish, onSkip }: PlanOnboardingProps) {
  const [step, setStep] = useState(0);
  const [columns, setColumns] = useState(TIMELINE_COLUMNS);
  const [invitedPeople, setInvitedPeople] = useState<string[]>([]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const totalSteps = STEPS.length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(9,30,66,0.54)',
      display: 'flex',
    }}>
      {/* Left panel */}
      <div style={{
        width: 480,
        flexShrink: 0,
        background: token('elevation.surface'),
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 36px',
        borderRight: `1px solid ${token('color.border')}`,
        position: 'relative',
      }}>
        {/* Skip link */}
        <button
          onClick={onSkip}
          style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', cursor: 'pointer', color: token('color.text'), fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, padding: 4 }}
        >
          <span style={{ fontSize: 14 }}>✕</span> Skip and go to plan
        </button>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, marginTop: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 4, background: token('color.background.brand.bold'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BoardsIcon label="" size="small" color={token('color.icon.inverse')} />
          </div>
          <Text weight="bold" color="color.text">Trella</Text>
        </div>

        {/* Step title */}
        <div style={{ marginBottom: 24 }}>
          <Text size="large" weight="bold" color="color.text">{current.label}</Text>
        </div>

        {/* Step content */}
        {step === 0 && (
          <StepTimelineColumns
            columns={columns}
            onRemove={id => setColumns(cols => cols.filter(c => c.id !== id))}
            onAdd={col => setColumns(cols => [...cols, col])}
          />
        )}
        {step === 1 && (
          <StepAddPeople
            invitedPeople={invitedPeople}
            onAdd={email => setInvitedPeople(p => [...p, email])}
            onRemove={email => setInvitedPeople(p => p.filter(x => x !== email))}
          />
        )}

        <div style={{ flex: 1 }} />

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24 }}>
          <Text size="small" color="color.text.subtle">
            {`Step ${current.stepNum} of ${totalSteps}`}
          </Text>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <Button appearance="default" onClick={() => setStep(s => s - 1)}>
                Previous
              </Button>
            )}
            {isLast ? (
              <Button appearance="primary" onClick={onFinish}>
                Finish
              </Button>
            ) : (
              <Button appearance="primary" onClick={() => setStep(s => s + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Right panel — plan preview */}
      <div style={{
        flex: 1,
        background: token('color.background.neutral.subtle'),
        overflowY: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 48px',
      }}>
        <OnboardingPreview plan={plan} step={step} columns={columns} />
      </div>
    </div>
  );
}

// ── Step components ──────────────────────────────────────────────────────────

function ColumnRow({ col, onRemove }: { col: typeof TIMELINE_COLUMNS[0]; onRemove: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: `1px solid ${token('color.border')}`,
        height: 36,
      }}
    >
      <span style={{ color: token('color.text.subtle'), fontSize: 14, cursor: 'grab' }}>⠿</span>
      <span style={{ fontSize: 14, color: token('color.text'), flex: 1 }}>{col.label}</span>
      {isHovered && (
        <button
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: token('color.text.danger'),
            padding: '2px 6px',
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function StepTimelineColumns({
  columns,
  onRemove,
  onAdd,
}: {
  columns: typeof TIMELINE_COLUMNS;
  onRemove: (id: string) => void;
  onAdd: (col: typeof TIMELINE_COLUMNS[0]) => void;
}) {
  const remaining = TIMELINE_COLUMNS.filter(c => !columns.some(x => x.id === c.id));

  return (
    <Stack space="space.150">
      <Text color="color.text.subtle">Add fields to display more data in the Timeline view. The fields below are shown by default.</Text>
      <div style={{ height: 8 }}>
        <Text size="small" weight="semibold" color="color.text">Fields</Text>
      </div>
      <div style={{ marginTop: 8 }}>
        {columns.map(col => (
          <ColumnRow key={col.id} col={col} onRemove={() => onRemove(col.id)} />
        ))}
      </div>
      {remaining.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Select
            options={remaining.map(r => ({ label: r.label, value: r }))}
            onChange={opt => {
              if (opt) {
                onAdd((opt as { value: typeof TIMELINE_COLUMNS[0] }).value);
              }
            }}
            placeholder="+ Add field"
            menuPlacement="auto"
            value={null}
          />
        </div>
      )}
    </Stack>
  );
}

function StepAddPeople({
  invitedPeople,
  onAdd,
  onRemove,
}: {
  invitedPeople: string[];
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAdd(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Stack space="space.200">
      <Text color="color.text.subtle">Invite teammates to create work in the plan.</Text>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: token('color.text'), display: 'block', marginBottom: 4 }}>
          Name or email
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter name or email..."
              style={{
                width: '100%',
                border: `1px solid ${token('color.border')}`,
                borderRadius: 4,
                padding: '8px 10px',
                fontSize: 14,
                color: token('color.text'),
                background: token('elevation.surface'),
                outline: 'none',
              }}
            />
          </div>
          <Button onClick={handleAdd} appearance="default">
            Add
          </Button>
        </div>
      </div>

      {invitedPeople.length > 0 && (
        <Stack space="space.075">
          <Text size="small" weight="semibold" color="color.text">Invited people</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {invitedPeople.map(person => (
              <div
                key={person}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 12,
                  background: token('color.background.neutral.subtle'),
                  border: `1px solid ${token('color.border')}`,
                  fontSize: 13,
                  color: token('color.text'),
                }}
              >
                <span>{person}</span>
                <button
                  onClick={() => onRemove(person)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: token('color.text.subtle'),
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Stack>
      )}
    </Stack>
  );
}

// ── Right panel preview ──────────────────────────────────────────────────────

function OnboardingPreview({ plan, step, columns }: { plan: PlanWithBoardsPublic; step: number; columns: typeof TIMELINE_COLUMNS }) {
  const totalItems = (plan.boardIds?.length ?? 1) * 3;
  return (
    <div style={{
      width: '100%', maxWidth: 760,
      background: token('elevation.surface'),
      borderRadius: 8,
      border: `1px solid ${token('color.border')}`,
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(9,30,66,0.25)',
    }}>
      {/* Plan header */}
      <div style={{ padding: '14px 20px 0', borderBottom: `1px solid ${token('color.border')}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ color: token('color.icon.brand') }}>
            <BoardsIcon label="" size="small" />
          </div>
          <Text weight="bold" color="color.text">{plan.name}</Text>
          <Text size="small" color="color.text.subtle">· {totalItems} work items</Text>
        </div>
        {/* Tab bar */}
        <div style={{ display: 'flex' }}>
          {['Summary', 'Timeline', 'Program', 'Calendar', 'Teams', 'Releases', 'Dependencies'].map((t, i) => {
            const active = t === 'Timeline';
            return (
              <div key={t} style={{
                padding: '6px 12px', fontSize: 13,
                color: active ? token('color.text') : token('color.text.subtle'),
                borderBottom: active ? `2px solid ${token('color.border.brand')}` : '2px solid transparent',
                fontWeight: active ? 500 : 400,
              }}>
                {t}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div style={{ padding: '16px 20px' }}>
        {step === 0 && <PreviewTimelineWithColumns columns={columns} />}
        {step === 1 && <PreviewTimelineWithAvatars />}
      </div>
    </div>
  );
}

function PreviewTimelineWithColumns({ columns }: { columns: typeof TIMELINE_COLUMNS }) {
  const COLORS = [token('color.background.success.bold'), token('color.background.brand.bold'), '#a855f7'];
  return (
    <div>
      {/* Column headers */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, paddingLeft: 140, color: token('color.text.subtle'), fontSize: 11 }}>
        {columns.slice(0, 4).map(col => (
          <span key={col.id} style={{ width: 60, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{col.label}</span>
        ))}
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: token('color.background.neutral.hovered') }} />
          <div style={{ width: `${40 + (i * 25) % 80}px`, height: 10, borderRadius: 4, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

function PreviewTimelineWithAvatars() {
  const COLORS = [token('color.background.success.bold'), token('color.background.brand.bold'), '#a855f7'];
  return (
    <div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: token('color.background.neutral.hovered') }} />
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: token('color.background.brand.bold'), flexShrink: 0, border: `2px solid ${token('color.border.inverse')}` }} />
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#a855f7', flexShrink: 0, border: `2px solid ${token('color.border.inverse')}`, marginLeft: -8 }} />
          <div style={{ width: `${40 + (i * 25) % 80}px`, height: 10, borderRadius: 4, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}
