'use client';

import React from 'react';
import { Stack, Inline, Text } from '@atlaskit/primitives';
import Heading from '@atlaskit/heading';
import Button from '@atlaskit/button/new';
import TextField from '@atlaskit/textfield';
import { token } from '@atlaskit/tokens';
import type { ProjectType } from './onboarding-wizard';
import { BoardPreview } from './board-preview';

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
    <div style={{ display: 'flex', minHeight: 500 }}>
      {/* Left: form */}
      <div style={{ flex: 1, padding: '48px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Stack space="space.500">
          <Stack space="space.150">
            <Heading as="h2" size="xlarge">Name your space</Heading>
            <Text color="color.text.subtle" size="medium">
              This is where you&apos;ll help your team track progress, stay organized, and manage tasks.
            </Text>
          </Stack>

          <Stack space="space.200">
            <Stack space="space.075">
              <Text size="small" weight="medium">Project name</Text>
              <TextField
                id="space-name"
                value={value}
                onChange={e => onChange((e.target as HTMLInputElement).value)}
                placeholder="e.g. My Software Team"
                autoFocus
              />
            </Stack>

            <Stack space="space.100">
              <Text size="small" color="color.text.subtle">Try one of these:</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {EXAMPLES.map(ex => (
                  <button
                    key={ex}
                    onClick={() => onChange(ex)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 20,
                      border: `1px solid ${value === ex ? token('color.border.brand') : token('color.border')}`,
                      backgroundColor: value === ex ? token('color.background.selected') : token('elevation.surface'),
                      color: value === ex ? token('color.text.brand') : token('color.text'),
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: value === ex ? 500 : 400,
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </Stack>
          </Stack>

          <Inline space="space.150">
            <Button appearance="subtle" onClick={onBack}>Back</Button>
            <Button appearance="primary" onClick={onNext} isDisabled={!value.trim()}>
              Continue
            </Button>
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
        <BoardPreview name={value || 'My Software Team'} projectType={projectType} activeTab="Board" />
      </div>
    </div>
  );
}
