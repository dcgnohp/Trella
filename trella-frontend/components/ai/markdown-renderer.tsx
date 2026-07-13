'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  children: string;
  testId?: string;
}

/** Renders model-generated markdown. Raw HTML is intentionally NOT enabled
 *  (no rehype-raw) so untrusted model output is escaped — XSS trust boundary. */
export function MarkdownRenderer({ children, testId }: MarkdownRendererProps) {
  return (
    <div data-testid={testId}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
