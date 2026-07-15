'use client';

import { useCallback, useState } from 'react';

import Button from '@atlaskit/button/new';
import { Box, Inline, Stack, xcss } from '@atlaskit/primitives';
import ProgressBar from '@atlaskit/progress-bar';

import { AiButton } from '@/components/ai/ai-button';
import { AiResponseCard } from '@/components/ai/ai-response-card';
import { useStoryPoints } from '@/lib/ai/use-story-points';
import type { ActivityLogsListTaskActivityData } from '@/lib/client';

const cardStyles = xcss({
  padding: 'space.150',
  backgroundColor: 'elevation.surface.sunken',
  border: '1px solid color.border',
});

export interface AiStoryPointCardProps {
  title: string;
  description?: string | null;
  labels?: string[];
  priority?: string | null;
  sprintGoal?: string | null;
  velocity?: number | null;
  history?: { title: string; storyPoint: number }[];
  onApply: (points: number) => void;
  testId?: string;
}

export function AiStoryPointCard({
  title,
  description,
  labels,
  priority,
  sprintGoal,
  velocity,
  history = [],
  onApply,
  testId,
}: AiStoryPointCardProps) {
  const [showCard, setShowCard] = useState(false);
  const { mutate, reset, data, isPending, error } = useStoryPoints();

  const runEstimate = useCallback(() => {
    setShowCard(true);
    mutate({
      title,
      description: description ?? undefined,
      labels,
      priority: priority ?? undefined,
      sprintGoal: sprintGoal ?? undefined,
      velocity: velocity ?? undefined,
      history,
    });
  }, [mutate, title, description, labels, priority, sprintGoal, velocity, history]);

  const handleApply = useCallback(() => {
    if (data?.storyPoint !== undefined) {
      onApply(data.storyPoint);
      setShowCard(false);
      reset();
    }
  }, [data, onApply, reset]);

  const handleCancel = useCallback(() => {
    setShowCard(false);
    reset();
  }, [reset]);

  if (!showCard) {
    return (
      <AiButton
        onClick={runEstimate}
        isDisabled={title.trim().length === 0}
        testId={testId}
      >
        ✨ Estimate
      </AiButton>
    );
  }

  return (
    <Box xcss={cardStyles} style={{ borderRadius: 6 }}>
      <Stack space="space.150">
        <AiResponseCard
          isLoading={isPending}
          error={error}
          onRetry={runEstimate}
        />
        {data && (
          <Stack space="space.100">
            <Inline alignBlock="center" space="space.100">
              <strong style={{ fontSize: '1.2em' }}>{data.storyPoint} Story Points</strong>
            </Inline>
            <Box>
              <span style={{ fontSize: '12px', color: 'var(--ds-text-subtlest)' }}>
                Confidence: {data.confidence}%
              </span>
              <ProgressBar value={data.confidence / 100} />
            </Box>
            <p style={{ fontSize: '14px' }}>{data.reason}</p>
            <Inline space="space.100" alignInline="end">
              <Button appearance="subtle" onClick={handleCancel}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={handleApply}>
                Apply {data.storyPoint} SP
              </Button>
            </Inline>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
