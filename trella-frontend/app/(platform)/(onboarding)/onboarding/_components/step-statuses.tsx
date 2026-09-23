'use client';

import React, { useState } from 'react';
import { Stack, Inline, Text } from '@atlaskit/primitives';
import Heading from '@atlaskit/heading';
import Button from '@atlaskit/button/new';
import TextField from '@atlaskit/textfield';
import { token } from '@atlaskit/tokens';
import type { ProjectType } from './onboarding-wizard';
import { BoardPreview } from './board-preview';

const STATUS_COLORS = ['#0052CC', '#FF991F', '#00875A', '#6554C0', '#DE350B'];

interface StepStatusesProps {
  value: string[];
  projectType: ProjectType;
  onChange: (v: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepStatuses({ value, projectType, onChange, onNext, onBack }: StepStatusesProps) {
  const update = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };

  const remove = (i: number) => {
    if (value.length <= 1) return;
    onChange(value.filter((_, idx) => idx !== i));
  };

  const add = () => onChange([...value, 'New Status']);

  return (
    <div style={{ display: 'flex', minHeight: 500 }}>
      {/* Left: form */}
      <div style={{ flex: 1, padding: '48px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Stack space="space.500">
          <Stack space="space.150">
            <Heading as="h2" size="xlarge">How do you track work?</Heading>
            <Text color="color.text.subtle" size="medium">
              As work progresses, it moves through these statuses. You can customize them anytime.
            </Text>
          </Stack>

          <Stack space="space.100">
            {value.map((status, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length],
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <TextField
                    id={`status-${i}`}
                    value={status}
                    onChange={e => update(i, (e.target as HTMLInputElement).value)}
                  />
                </div>
                <button
                  onClick={() => remove(i)}
                  disabled={value.length <= 1}
                  style={{
                    background: 'none', border: 'none', cursor: value.length <= 1 ? 'not-allowed' : 'pointer',
                    color: token('color.text.subtle'), fontSize: 20, lineHeight: 1,
                    padding: '4px', opacity: value.length <= 1 ? 0.3 : 1,
                  }}
                  aria-label="Remove status"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              onClick={add}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: token('color.text.brand'), textAlign: 'left',
                fontSize: 14, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add status
            </button>
          </Stack>

          <Inline space="space.150">
            <Button appearance="subtle" onClick={onBack}>Back</Button>
            <Button appearance="primary" onClick={onNext}>Continue</Button>
          </Inline>
        </Stack>
      </div>

      {/* Right: preview */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #0052CC 0%, #0747A6 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
      }}>
        <BoardPreview name="My Software Team" projectType={projectType} activeTab="Board" statuses={value} />
      </div>
    </div>
  );
}
