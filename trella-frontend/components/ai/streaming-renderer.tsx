'use client';
import { MarkdownRenderer } from '@/components/ai/markdown-renderer';

interface StreamingRendererProps {
  content: string;
  isStreaming: boolean;
}

/**
 * Renders assistant output. While streaming, shows incremental text as
 * plain whitespace-preserving content (cheap, avoids re-parsing markdown on
 * every token). Once complete, renders via MarkdownRenderer for formatting.
 */
export function StreamingRenderer({ content, isStreaming }: StreamingRendererProps) {
  if (isStreaming) {
    return (
      <div data-testid="streaming-text" style={{ whiteSpace: 'pre-wrap' }}>
        {content}
      </div>
    );
  }
  return <MarkdownRenderer testId="streaming-markdown">{content}</MarkdownRenderer>;
}
