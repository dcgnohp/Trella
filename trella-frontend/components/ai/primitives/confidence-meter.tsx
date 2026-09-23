'use client';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import ProgressBar from '@atlaskit/progress-bar';

import { clamp, formatConfidence } from './mappings';

export { formatConfidence };

interface ConfidenceMeterProps {
  value: number;
}

/** Progress bar + NN% label expressing the AI's relative confidence. */
export function ConfidenceMeter({ value }: ConfidenceMeterProps) {
  const fraction = clamp(value, 0, 1);
  const percent = formatConfidence(value);
  return (
    <Stack space="space.025">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Text size="small" color="color.text.subtle">
          Confidence
        </Text>
        <Text size="small" weight="medium">
          {percent}%
        </Text>
      </Inline>
      <div role="meter" aria-label="confidence" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <ProgressBar value={fraction} />
      </div>
      <Text size="small" color="color.text.subtlest">
        The AI&apos;s relative confidence in this insight.
      </Text>
    </Stack>
  );
}
