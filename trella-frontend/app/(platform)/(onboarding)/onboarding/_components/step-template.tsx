'use client';

import React from 'react';
import { Stack, Inline, Text } from '@atlaskit/primitives';
import Heading from '@atlaskit/heading';
import Button from '@atlaskit/button/new';
import { token } from '@atlaskit/tokens';
import type { ProjectType } from './onboarding-wizard';

interface TemplateCard {
  type: ProjectType;
  title: string;
  description: string;
  illustration: React.ReactNode;
}

const TEMPLATES: TemplateCard[] = [
  {
    type: 'kanban',
    title: 'Kanban',
    description: 'Visualize work and maximize efficiency with a kanban board',
    illustration: (
      <div style={{ display: 'flex', gap: 6, height: 80, alignItems: 'flex-start' }}>
        {['#0052CC', '#00875A', '#FF991F'].map((color, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ height: 4, borderRadius: 2, backgroundColor: color, opacity: 0.8 }} />
            {[0.9, 0.7, 0.5].slice(0, i + 1).map((op, j) => (
              <div key={j} style={{ height: 18, borderRadius: 3, backgroundColor: token('color.background.neutral'), border: `1px solid ${token('color.border')}`, opacity: op }} />
            ))}
          </div>
        ))}
      </div>
    ),
  },
  {
    type: 'scrum',
    title: 'Scrum',
    description: 'Plan, prioritize, and schedule sprints using scrum framework',
    illustration: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: 80 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Backlog', 'Sprint 1', 'Board'].map((label, i) => (
            <div key={i} style={{
              padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600,
              backgroundColor: i === 1 ? token('color.background.brand.bold') : token('color.background.neutral'),
              color: i === 1 ? token('color.text.inverse') : token('color.text.subtle'),
            }}>{label}</div>
          ))}
        </div>
        {[0.9, 0.7, 0.5, 0.3].map((op, i) => (
          <div key={i} style={{ height: 14, borderRadius: 3, backgroundColor: token('color.background.neutral'), border: `1px solid ${token('color.border')}`, opacity: op }} />
        ))}
      </div>
    ),
  },
  {
    type: 'project-management',
    title: 'Project management',
    description: 'Manage and track agile work plus integrate developer tools',
    illustration: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: 80 }}>
        {[['✓', '#00875A'], ['●', '#0052CC'], ['○', '#FF991F'], ['✓', '#00875A']].map(([icon, color], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 1 - i * 0.15 }}>
            <span style={{ color: color as string, fontSize: 10 }}>{icon}</span>
            <div style={{ flex: 1, height: 10, borderRadius: 3, backgroundColor: token('color.background.neutral') }} />
          </div>
        ))}
      </div>
    ),
  },
];

interface StepTemplateProps {
  value: ProjectType;
  onChange: (type: ProjectType) => void;
  onNext: () => void;
}

export function StepTemplate({ value, onChange, onNext }: StepTemplateProps) {
  return (
    <Stack space="space.0">
      <div style={{ textAlign: 'center', padding: '48px 48px 32px' }}>
        <Heading as="h2" size="xlarge">Select a template to get started</Heading>
        <div style={{ marginTop: 8 }}>
          <Text color="color.text.subtle" size="medium">You can always change this later. Selecting a template won&apos;t limit what you can do.</Text>
        </div>
      </div>

      <div style={{ paddingInline: '48px', paddingBottom: '32px' }}>
        {/* "Software development" group container — matches Jira reference */}
        <div style={{
          border: `1px solid ${token('color.border')}`,
          borderRadius: '8px',
          backgroundColor: token('elevation.surface.sunken'),
          padding: token('space.400'),
        }}>
          <Stack space="space.300">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🧑‍💻</span>
              <Heading as="h3" size="medium">Software development</Heading>
            </div>
            <Inline space="space.200">
              {TEMPLATES.map(tpl => (
                <div
                  key={tpl.type}
                  onClick={() => onChange(tpl.type)}
                  style={{
                    flex: 1, cursor: 'pointer', borderRadius: '6px',
                    border: `2px solid ${value === tpl.type ? token('color.border.brand') : token('color.border')}`,
                    padding: token('space.250'),
                    backgroundColor: token('elevation.surface'),
                    boxShadow: value === tpl.type ? token('elevation.shadow.raised') : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Stack space="space.150">
                    <div style={{
                      padding: token('space.150'),
                      borderRadius: '3px',
                      backgroundColor: token('color.background.neutral'),
                    }}>
                      {tpl.illustration}
                    </div>
                    <Text weight="bold">{tpl.title}</Text>
                    <Text size="small" color="color.text.subtle">{tpl.description}</Text>
                  </Stack>
                </div>
              ))}
            </Inline>
          </Stack>
        </div>
      </div>

      <div style={{ padding: '0 48px 48px', display: 'flex', justifyContent: 'center' }}>
        <Button appearance="primary" onClick={onNext}>Continue</Button>
      </div>
    </Stack>
  );
}
