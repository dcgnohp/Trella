'use client';

import React from 'react';
import { Stack, Inline, Text } from '@atlaskit/primitives';
import Heading from '@atlaskit/heading';
import Button from '@atlaskit/button/new';
import { token } from '@atlaskit/tokens';
import type { ProjectType } from './onboarding-wizard';
import { BoardPreview } from './board-preview';

const WORK_TYPES = [
  { key: 'Task', icon: '☑', color: '#0052CC', description: 'A small piece of work.' },
  { key: 'Story', icon: '🔖', color: '#00875A', description: 'A requirement expressed from the user\'s perspective.' },
  { key: 'Feature', icon: '💰', color: '#6554C0', description: 'A broad piece of functionality.' },
  { key: 'Request', icon: '➕', color: '#FF991F', description: 'An ask for assistance.' },
  { key: 'Bug', icon: '🐛', color: '#DE350B', description: 'A problem that needs fixing.' },
];

interface StepWorkTypesProps {
  value: string[];
  projectType: ProjectType;
  onChange: (v: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepWorkTypes({ value, projectType, onChange, onNext, onBack }: StepWorkTypesProps) {
  const toggle = (key: string) => {
    onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key]);
  };

  return (
    <div style={{ display: 'flex', minHeight: 500 }}>
      <div style={{ flex: 1, padding: '48px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Stack space="space.500">
          <Stack space="space.150">
            <Heading as="h2" size="xlarge">What types of work do you need?</Heading>
            <Text color="color.text.subtle" size="medium">These form the building blocks of your space.</Text>
          </Stack>

          <Stack space="space.075">
            {WORK_TYPES.map(wt => (
              <div
                key={wt.key}
                onClick={() => toggle(wt.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  border: `1px solid ${value.includes(wt.key) ? token('color.border.brand') : token('color.border')}`,
                  borderRadius: '3px',
                  cursor: 'pointer',
                  backgroundColor: value.includes(wt.key) ? token('color.background.selected') : 'transparent',
                  transition: 'all 0.1s ease',
                }}
              >
                <span style={{ fontSize: 16, color: wt.color }}>{wt.icon}</span>
                <Stack space="space.0">
                  <Text weight="medium">{wt.key}</Text>
                  <Text size="small" color="color.text.subtle">{wt.description}</Text>
                </Stack>
                <div style={{ marginLeft: 'auto' }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 3,
                    border: `2px solid ${value.includes(wt.key) ? token('color.border.brand') : token('color.border')}`,
                    backgroundColor: value.includes(wt.key) ? token('color.background.brand.bold') : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {value.includes(wt.key) && <span style={{ color: 'white', fontSize: 11 }}>✓</span>}
                  </div>
                </div>
              </div>
            ))}
          </Stack>

          <Text size="small" color="color.text.subtlest">Don&apos;t worry, you can change these later.</Text>

          <Inline space="space.100">
            <Button appearance="subtle" onClick={onBack}>Back</Button>
            <Button appearance="primary" onClick={onNext} isDisabled={value.length === 0}>Next</Button>
          </Inline>
        </Stack>
      </div>

      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #0052CC 0%, #0747A6 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
      }}>
        <BoardPreview name="My Software Team" projectType={projectType} activeTab="List" workTypes={value} />
      </div>
    </div>
  );
}
