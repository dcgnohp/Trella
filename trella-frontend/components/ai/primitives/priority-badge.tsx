'use client';
import Lozenge from '@atlaskit/lozenge';

import { priorityAppearance, type Priority } from './mappings';

export { priorityAppearance };
export type { Priority };

interface PriorityBadgeProps {
  priority: Priority;
}

/** Priority pill with the label uppercased (LOW / MEDIUM / HIGH). */
export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <Lozenge appearance={priorityAppearance(priority)} isBold>
      {priority.toUpperCase()}
    </Lozenge>
  );
}
