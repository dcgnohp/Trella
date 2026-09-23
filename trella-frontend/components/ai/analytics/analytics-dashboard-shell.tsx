'use client';
import type { ReactNode } from 'react';

import { Box, Inline, Stack, Text } from '@atlaskit/primitives';
import Heading from '@atlaskit/heading';

interface AnalyticsDashboardShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Page-level frame: a header row (title/subtitle left, actions right) then body. */
export function AnalyticsDashboardShell({
  title,
  subtitle,
  actions,
  children,
}: AnalyticsDashboardShellProps) {
  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center" space="space.200">
        <Stack space="space.050">
          <Heading size="large">{title}</Heading>
          {subtitle ? (
            <Text color="color.text.subtle">{subtitle}</Text>
          ) : null}
        </Stack>
        {actions ? <Box>{actions}</Box> : null}
      </Inline>
      {children}
    </Stack>
  );
}
