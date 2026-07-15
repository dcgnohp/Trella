'use client';

import { useCallback } from 'react';

import Button from '@atlaskit/button/new';
import { Box, Inline, Stack, xcss } from '@atlaskit/primitives';

import { AiButton } from '@/components/ai/ai-button';
import { AiLoading } from '@/components/ai/ai-loading';
import { AiResponseCard } from '@/components/ai/ai-response-card';
import { useSummarizeDoc } from '@/lib/ai/use-summarize-doc';

const cardStyles = xcss({
  padding: 'space.200',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
});

const hintStyles = xcss({ color: 'color.text.subtlest' });

export interface AiDocSummaryProps {
  content?: string | null;
  title?: string | null;
  testId?: string;
}

/**
 * Read-only AI summary panel for a Knowledge Center document. Never mutates or
 * saves the document — it only reads `content`/`title` and displays a generated
 * summary plus key points / key decisions / action items (design P3-F2).
 */
export function AiDocSummary({ content, title, testId }: AiDocSummaryProps) {
  const { mutate, data, isPending, error } = useSummarizeDoc();
  const trimmed = (content ?? '').trim();
  const isEmpty = trimmed.length === 0;

  const runSummarize = useCallback(() => {
    if (isEmpty) return;
    mutate({ content: trimmed, title: title ?? undefined });
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

        {isPending ? (
          <AiLoading />
        ) : error ? (
          <AiResponseCard error={error} onRetry={runSummarize} />
        ) : data ? (
          <Stack space="space.200">
            <Box>{data.summary}</Box>

            <BulletSection heading="Key points" items={data.keyPoints} />
            <BulletSection heading="Key decisions" items={data.keyDecisions} />
            <BulletSection heading="Action items" items={data.actionItems} />

            <Inline space="space.100">
              <Button
                appearance="subtle"
                onClick={runSummarize}
                testId="ai-doc-summary-regenerate"
              >
                Regenerate
              </Button>
              <Button
                appearance="subtle"
                onClick={handleCopy}
                testId="ai-doc-summary-copy"
              >
                Copy
              </Button>
            </Inline>
          </Stack>
        ) : (
          <Stack space="space.100" alignInline="start">
            <AiButton
              onClick={runSummarize}
              isDisabled={isEmpty}
              testId="ai-doc-summary-generate"
            >
              Summarize
            </AiButton>
            {isEmpty ? (
              <Box xcss={hintStyles}>Add content to generate a summary.</Box>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

/** Labelled "• "-prefixed list; renders nothing when there are no items. */
function BulletSection({
  heading,
  items,
}: {
  heading: string;
  items?: string[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <Stack space="space.050">
      <strong>{heading}</strong>
      {items.map((item, i) => (
        <Box key={i}>{`\u2022 ${item}`}</Box>
      ))}
    </Stack>
  );
}
