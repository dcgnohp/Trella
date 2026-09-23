'use client';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import ProgressBar from '@atlaskit/progress-bar';

import { StatusBadge, type StatusTone } from '@/components/ai/primitives';

interface HealthOverviewBlockProps {
  /** Semantic tone mapped at the call site (sprint or project status). */
  tone: StatusTone;
  /** Display label for the status badge. */
  label: string;
  score?: number;
  summary: string;
}

/** Reusable health overview: status badge + score meter + summary. */
export function HealthOverviewBlock({ tone, label, score, summary }: HealthOverviewBlockProps) {
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center">
        <StatusBadge tone={tone} label={label} />
        {typeof score === 'number' ? (
          <Text size="small" color="color.text.subtle">
            {score}/100
          </Text>
        ) : null}
      </Inline>
      {typeof score === 'number' ? (
        <div role="meter" aria-label="health score" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
          <ProgressBar value={Math.min(1, Math.max(0, score / 100))} />
        </div>
      ) : null}
      <Text>{summary}</Text>
    </Stack>
  );
}
