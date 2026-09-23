'use client';
import { Box, Inline, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';

import { severityMeta, type Severity } from './mappings';

export { severityMeta };
export type { Severity };

interface SeverityIndicatorProps {
  severity: Severity;
}

/** A small colored dot + label conveying risk severity at a glance. */
export function SeverityIndicator({ severity }: SeverityIndicatorProps) {
  const { label, colorToken } = severityMeta(severity);
  return (
    <Inline space="space.050" alignBlock="center">
      <Box
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: token(colorToken as Parameters<typeof token>[0]),
          flexShrink: 0,
        }}
      />
      <Text size="small" weight="medium">
        {label}
      </Text>
    </Inline>
  );
}
