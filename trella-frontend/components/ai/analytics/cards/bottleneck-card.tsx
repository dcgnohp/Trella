import Lozenge from '@atlaskit/lozenge';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';

import type { BottleneckItem } from '@/lib/client';

const cardStyles = xcss({
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
});

interface BottleneckCardProps {
  bottleneck: BottleneckItem;
}

/** A process bottleneck: title + impact, with an optional area tag. */
export function BottleneckCard({ bottleneck }: BottleneckCardProps) {
  return (
    <Box xcss={cardStyles}>
      <Stack space="space.075">
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Text weight="medium">{bottleneck.title}</Text>
          {bottleneck.area ? (
            <Lozenge appearance="default">{bottleneck.area}</Lozenge>
          ) : null}
        </Inline>
        <Text size="small" color="color.text.subtle">
          Impact: {bottleneck.impact}
        </Text>
      </Stack>
    </Box>
  );
}
