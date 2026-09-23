'use client';
import Lozenge from '@atlaskit/lozenge';
import { Box, Inline, Text, xcss } from '@atlaskit/primitives';

import type { ActionItem } from '@/lib/client';
import { PriorityBadge } from '@/components/ai/primitives';

const cardStyles = xcss({
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
});

const EFFORT_LABEL: Record<NonNullable<ActionItem['effort']>, string> = {
  s: 'Small',
  m: 'Medium',
  l: 'Large',
};

interface ActionCardProps {
  item: ActionItem;
}

/** A suggested next action: priority + action text + optional effort tag. */
export function ActionCard({ item }: ActionCardProps) {
  return (
    <Box xcss={cardStyles}>
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Inline space="space.100" alignBlock="center">
          <PriorityBadge priority={item.priority} />
          <Text weight="medium">{item.action}</Text>
        </Inline>
        {item.effort ? (
          <Lozenge appearance="default">{EFFORT_LABEL[item.effort]}</Lozenge>
        ) : null}
      </Inline>
    </Box>
  );
}
