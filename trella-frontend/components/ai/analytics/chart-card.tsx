'use client';
import type { ReactNode } from 'react';

import { Box, Stack, Text, xcss } from '@atlaskit/primitives';

const cardStyles = xcss({
  padding: 'space.200',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
});

interface ChartCardProps {
  title: string;
  /** Muted caption under the title (e.g. to label a chart as an AI assessment). */
  caption?: string;
  children: ReactNode;
}

/** Titled bordered container with a fixed-height body for a chart. */
export function ChartCard({ title, caption, children }: ChartCardProps) {
  return (
    <Box xcss={cardStyles}>
      <Stack space="space.100">
        <Stack space="space.025">
          <Text weight="medium">{title}</Text>
          {caption ? (
            <Text size="small" color="color.text.subtlest">
              {caption}
            </Text>
          ) : null}
        </Stack>
        <div style={{ height: 240 }}>{children}</div>
      </Stack>
    </Box>
  );
}
