'use client';
import { Box, Stack, xcss } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';

import { AiLoading } from './ai-loading';
import { MarkdownRenderer } from './markdown-renderer';
import { RetryButton } from './retry-button';

const cardStyles = xcss({
  padding: 'space.200',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
});

interface AiResponseCardProps {
  content?: string;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  testId?: string;
}

/** Surface that renders an AI result, with loading, error+retry, and content
 *  states. All styling via ADS tokens (xcss). */
export function AiResponseCard({
  content,
  isLoading,
  error,
  onRetry,
  testId,
}: AiResponseCardProps) {
  return (
    <Box xcss={cardStyles} testId={testId}>
      {isLoading ? (
        <AiLoading />
      ) : error ? (
        <SectionMessage appearance="error" title="Something went wrong">
          <Stack space="space.100">
            <span>{error.message}</span>
            {onRetry ? <RetryButton onRetry={onRetry} /> : null}
          </Stack>
        </SectionMessage>
      ) : (
        <MarkdownRenderer>{content ?? ''}</MarkdownRenderer>
      )}
    </Box>
  );
}
