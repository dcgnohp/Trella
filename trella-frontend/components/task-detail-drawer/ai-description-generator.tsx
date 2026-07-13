'use client';

import { useCallback, useState } from 'react';

import Button from '@atlaskit/button/new';
import { Box, Inline, Stack, xcss } from '@atlaskit/primitives';
import Textarea from '@atlaskit/textarea';

import { AiButton } from '@/components/ai/ai-button';
import { AiModal } from '@/components/ai/ai-modal';
import { AiResponseCard } from '@/components/ai/ai-response-card';
import { useGenerateDescription } from '@/lib/ai/use-generate-description';
import type { DescriptionResponse } from '@/lib/client';

const footerStyles = xcss({ paddingTop: 'space.200' });

/** Compose the structured response into a single editable markdown string. */
function composeMarkdown(data: DescriptionResponse): string {
  const sections: string[] = [];
  if (data.description?.trim()) {
    sections.push(data.description.trim());
  }
  const bullets = (heading: string, items: string[]): void => {
    if (items.length > 0) {
      sections.push(`## ${heading}\n${items.map((i) => `- ${i}`).join('\n')}`);
    }
  };
  bullets('Acceptance Criteria', data.acceptanceCriteria);
  bullets('Technical Notes', data.technicalNotes);
  bullets('Definition of Done', data.definitionOfDone);
  return sections.join('\n\n');
}

export interface AiDescriptionGeneratorProps {
  title: string;
  description?: string | null;
  labels?: string[];
  priority?: string | null;
  sprint?: string | null;
  /** Parent decides how to apply the text. This component NEVER saves. */
  onApply: (markdown: string) => void;
  testId?: string;
}

/**
 * ✨ Generate description: opens a modal, generates a structured description,
 * lets the user edit it, and hands the edited text to `onApply`. Applying only
 * updates local state in the parent — it never persists the task (P1-F2).
 */
export function AiDescriptionGenerator({
  title,
  description,
  labels,
  priority,
  sprint,
  onApply,
  testId,
}: AiDescriptionGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { mutate, reset, data, isPending, error } = useGenerateDescription();

  const runGenerate = useCallback(() => {
    mutate(
      {
        title,
        description: description ?? undefined,
        labels,
        priority: priority ?? undefined,
        sprint: sprint ?? undefined,
      },
      { onSuccess: (res) => setDraft(composeMarkdown(res)) },
    );
  }, [mutate, title, description, labels, priority, sprint]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    runGenerate();
  }, [runGenerate]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setDraft('');
    reset();
  }, [reset]);

  const handleApply = useCallback(() => {
    // Apply ONLY hands the edited text to the parent; it never saves or calls
    // a task API. Persistence stays the user's explicit action (P1-F2).
    onApply(draft);
    handleClose();
  }, [onApply, draft, handleClose]);

  return (
    <>
      <AiButton
        onClick={handleOpen}
        isDisabled={title.trim().length === 0}
        testId={testId}
      >
        ✨ Generate description
      </AiButton>
      <AiModal
        isOpen={isOpen}
        onClose={handleClose}
        title="Generate description"
      >
        <Stack space="space.200">
          {data ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              minimumRows={10}
              aria-label="Generated description"
            />
          ) : (
            <AiResponseCard
              isLoading={isPending}
              error={error}
              onRetry={runGenerate}
            />
          )}
          <Box xcss={footerStyles}>
            <Inline space="space.100" alignInline="end">
              <Button
                appearance="subtle"
                onClick={handleClose}
                testId="ai-desc-cancel"
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleApply}
                isDisabled={!data || draft.trim().length === 0}
                testId="ai-desc-apply"
              >
                Apply
              </Button>
            </Inline>
          </Box>
        </Stack>
      </AiModal>
    </>
  );
}
