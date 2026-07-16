'use client';
import { useState } from 'react';

import Button from '@atlaskit/button/new';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';

import type { RecommendationItem } from '@/lib/client';
import { ConfidenceMeter, PriorityBadge } from '@/components/ai/primitives';

const cardStyles = xcss({
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
});

interface RecommendationCardProps {
  rec: RecommendationItem;
}

/** An AI recommendation as an action card: priority, impact, confidence, expand. */
export function RecommendationCard({ rec }: RecommendationCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <Box xcss={cardStyles}>
      <Stack space="space.100">
        <Inline spread="space-between" alignBlock="center" space="space.100">
          <Inline space="space.100" alignBlock="center">
            <PriorityBadge priority={rec.priority} />
            <Text weight="medium">{rec.title}</Text>
          </Inline>
          <Button appearance="subtle" spacing="compact" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Why this insight?'}
          </Button>
        </Inline>
        <Text size="small" color="color.text.subtle">
          Expected impact: {rec.expectedImpact}
        </Text>
        <ConfidenceMeter value={rec.confidence} />
        {open ? <Text size="small">{rec.rationale}</Text> : null}
      </Stack>
    </Box>
  );
}
