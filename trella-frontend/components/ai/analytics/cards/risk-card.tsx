'use client';
import { useState } from 'react';

import Button from '@atlaskit/button/new';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';

import type { RiskItem } from '@/lib/client';
import { SeverityIndicator } from '@/components/ai/primitives';

const cardStyles = xcss({
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
});

interface RiskCardProps {
  risk: RiskItem;
}

/** A single AI-identified risk: severity + title, expand for the reasoning. */
export function RiskCard({ risk }: RiskCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <Box xcss={cardStyles}>
      <Stack space="space.100">
        <Inline spread="space-between" alignBlock="center" space="space.100">
          <Inline space="space.100" alignBlock="center">
            <SeverityIndicator severity={risk.severity} />
            <Text weight="medium">{risk.title}</Text>
          </Inline>
          <Button appearance="subtle" spacing="compact" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Why this insight?'}
          </Button>
        </Inline>
        {open ? (
          <Stack space="space.050">
            <Text size="small">{risk.rationale}</Text>
            {risk.likelihood ? (
              <Text size="small" color="color.text.subtle">
                Likelihood: {risk.likelihood}
              </Text>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}
