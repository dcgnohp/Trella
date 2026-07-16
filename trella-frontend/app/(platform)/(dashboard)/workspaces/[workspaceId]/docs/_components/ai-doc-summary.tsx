'use client';

import { useCallback, useEffect } from 'react';

import { Sparkles, X } from 'lucide-react';

import { AiLoading } from '@/components/ai/ai-loading';
import { AiResponseCard } from '@/components/ai/ai-response-card';
import { useSummarizeDoc } from '@/lib/ai/use-summarize-doc';

export interface AiDocSummaryPanelProps {
  content?: string | null;
  title?: string | null;
  onClose: () => void;
}

/**
 * Right-hand AI summary panel for the document viewer. Renders beside the
 * document content so the user can scroll the doc and read the summary at the
 * same time. Auto-summarizes on mount; read-only (never writes the document).
 */
export function AiDocSummaryPanel({
  content,
  title,
  onClose,
}: AiDocSummaryPanelProps) {
  const { mutate, data, isPending, error } = useSummarizeDoc();
  const trimmed = (content ?? '').trim();
  const isEmpty = trimmed.length === 0;

  const run = useCallback(() => {
    if (isEmpty) return;
    mutate({ content: trimmed, title: title ?? undefined });
  }, [isEmpty, mutate, trimmed, title]);

  // Auto-summarize when the panel mounts (opened).
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = useCallback(() => {
    const text = data?.summary;
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(text);
  }, [data]);

  return (
    <aside className="w-[360px] flex-shrink-0 border-l border-border flex flex-col overflow-hidden bg-background">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="w-4 h-4 text-primary" />
          AI summary
        </span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          title="Close AI summary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Panel body (scrolls independently of the document) */}
      <div className="flex-1 overflow-y-auto p-4">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">
            This document has no content to summarize.
          </p>
        ) : error ? (
          <AiResponseCard error={error} onRetry={run} />
        ) : isPending || !data ? (
          <AiLoading label={'Summarizing\u2026'} />
        ) : (
          <div className="flex flex-col gap-4 text-sm text-foreground">
            <p className="leading-relaxed">{data.summary}</p>
            <PanelSection heading="Key points" items={data.keyPoints} />
            <PanelSection heading="Key decisions" items={data.keyDecisions} />
            <PanelSection heading="Action items" items={data.actionItems} />
            <div className="flex gap-2 pt-1 border-t border-border">
              <button
                onClick={run}
                className="mt-3 h-7 px-2.5 text-xs font-medium border border-border rounded hover:bg-accent text-foreground transition-colors"
              >
                Regenerate
              </button>
              <button
                onClick={handleCopy}
                className="mt-3 h-7 px-2.5 text-xs font-medium border border-border rounded hover:bg-accent text-foreground transition-colors"
              >
                Copy summary
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Labelled list; renders nothing when empty. */
function PanelSection({ heading, items }: { heading: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        {heading}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-primary">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
