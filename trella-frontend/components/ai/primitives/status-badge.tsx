'use client';
import Lozenge from '@atlaskit/lozenge';

import { statusAppearance, type LozengeAppearance, type StatusTone } from './mappings';

export { statusAppearance };
export type { LozengeAppearance, StatusTone };

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
}

/** Bold status pill driven by a semantic tone. */
export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <Lozenge appearance={statusAppearance(tone)} isBold>
      {label}
    </Lozenge>
  );
}
