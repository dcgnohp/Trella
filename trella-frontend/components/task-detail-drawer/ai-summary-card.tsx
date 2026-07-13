'use client';

import { useCallback } from 'react';

import Button from '@atlaskit/button/new';
import { Box, Inline, Stack, xcss } from '@atlaskit/primitives';

import { AiButton } from '@/components/ai/ai-button';
import { AiResponseCard } from '@/components/ai/ai-response-card';
import { useSummarizeTask } from '@/lib/ai/use-summarize-task';

const cardStyles = xcss({
  padding: 'space.200',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
});

const hintStyles = xcss({ color: 'color.text.subtlest' });

export interface AiSummaryCardProps {
  description?: string | null;
  title?: string | null;
  testId?: string;
}

/**
 * Read-only AI summary of the current task description. Never mutates or saves
 * the task — it only reads `description`/`title` and displays a summary (P1-F3).
 */
export function AiSummaryCard({ description, title, testId }: AiSummaryCardProps) {
  const { mutate, data, isPending, error } = useSummarizeTask();
  const trimmed = (description ?? '').trim();
  const isEmpty = trimmed.length === 0;

  const runSummarize = useCallback(() => {
    if (isEmpty) return;
    mutate({ description: trimmed, title: title ?? undefined });
  }, [isEmpty, mutate, trimmed, title]);

  const handleCopy = useCallback(() => {
    const text = data?.summary;
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(text);
  }, [data]);

  return (
    <Box xcss={cardStyles} testId={testId}>
      <Stack space="space.200">
        <strong>AI summary</strong>

        {isPending || error ? (
          <AiResponseCard
            isLoading={isPending}
            error={error}
            onRetry={runSummarize}
          />
        ) : data ? (
          <Stack space="space.200">
            <Box>{data.summary}</Box>

            {data.risks.length > 0 ? (
              <Stack space="space.050">
                <strong>Risks</strong>
                {data.risks.map((risk, i) => (
                  <Box key={i}>{`\u2022 ${risk}`}</Box>
                ))}
              </Stack>
            ) : null}

            {data.actionItems.length > 0 ? (
              <Stack space="space.050">
                <strong>Action items</strong>
                {data.actionItems.map((item, i) => (
                  <Box key={i}>{`\u2022 ${item}`}</Box>
                ))}
              </Stack>
            ) : null}

            <Inline space="space.100">
              <Button
                appearance="subtle"
                onClick={runSummarize}
                testId="ai-summary-regenerate"
              >
                Regenerate
              </Button>
              <Button appearance="subtle" onClick={handleCopy} testId="ai-summary-copy">
                Copy
              </Button>
            </Inline>
          </Stack>
        ) : (
          <Stack space="space.100" alignInline="start">
            <AiButton
              onClick={runSummarize}
              isDisabled={isEmpty}
              testId="ai-summary-generate"
            >
              Summarize
            </AiButton>
            {isEmpty ? (
              <Box xcss={hintStyles}>Add a description to generate a summary.</Box>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
