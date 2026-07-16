'use client';
import type { ReactNode } from 'react';

import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';

const cardStyles = xcss({
  padding: 'space.200',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
});

interface MetricCardProps {
  label: string;
  value: ReactNode;
  /** Signed delta; sign drives the ▲/▼ arrow and color. */
  delta?: number;
  hint?: string;
}

/** A single scan-first metric: big value, small label, optional delta + hint. */
export function MetricCard({ label, value, delta, hint }: MetricCardProps) {
  const hasDelta = typeof delta === 'number' && delta !== 0;
  const positive = (delta ?? 0) > 0;
  const deltaColor = positive
    ? token('color.text.success')
    : token('color.text.danger');

  return (
    <Box xcss={cardStyles}>
      <Stack space="space.050">
        <Text size="small" color="color.text.subtle">
          {label}
        </Text>
        <Inline space="space.100" alignBlock="baseline">
          <Text size="large" weight="bold">
            {value}
          </Text>
          {hasDelta ? (
            <span style={{ fontSize: 12, color: deltaColor }}>
              {positive ? '▲' : '▼'} {Math.abs(delta as number)}
            </span>
          ) : null}
        </Inline>
        {hint ? (
          <Text size="small" color="color.text.subtlest">
            {hint}
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}
