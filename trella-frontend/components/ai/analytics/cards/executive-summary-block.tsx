'use client';
import { Inline, Stack, Text } from '@atlaskit/primitives';

import type { SprintHealth } from '@/lib/client';
import { StatusBadge, type StatusTone } from '@/components/ai/primitives';

/** Pure: sprint health status → semantic tone + display label. */
export function healthStatusTone(
  status: SprintHealth['status'],
): { tone: StatusTone; label: string } {
  switch (status) {
    case 'on_track':
      return { tone: 'success', label: 'On track' };
    case 'at_risk':
      return { tone: 'warning', label: 'At risk' };
    case 'off_track':
      return { tone: 'danger', label: 'Off track' };
  }
}

interface ExecutiveSummaryBlockProps {
  summary: string;
  health?: SprintHealth;
}

/** Executive summary text with a health status badge (+ score when present). */
export function ExecutiveSummaryBlock({ summary, health }: ExecutiveSummaryBlockProps) {
  const meta = health ? healthStatusTone(health.status) : null;
  return (
    <Stack space="space.150">
      {meta ? (
        <Inline space="space.100" alignBlock="center">
          <StatusBadge tone={meta.tone} label={meta.label} />
          {typeof health?.score === 'number' ? (
            <Text size="small" color="color.text.subtle">
              Score {health.score}
            </Text>
          ) : null}
        </Inline>
      ) : null}
      <Text>{summary}</Text>
    </Stack>
  );
}
