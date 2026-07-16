'use client';
import { Box, Stack, Text, xcss } from '@atlaskit/primitives';

import type { BlockerItem } from '@/lib/client';

const cardStyles = xcss({
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
});

interface BlockerCardProps {
  blocker: BlockerItem;
}

/** A blocker: title + impact, with a suggested resolution when present. */
export function BlockerCard({ blocker }: BlockerCardProps) {
  return (
    <Box xcss={cardStyles}>
      <Stack space="space.075">
        <Text weight="medium">{blocker.title}</Text>
        <Text size="small" color="color.text.subtle">
          Impact: {blocker.impact}
        </Text>
        {blocker.suggestedResolution ? (
          <Text size="small">
            Suggested resolution: {blocker.suggestedResolution}
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}
