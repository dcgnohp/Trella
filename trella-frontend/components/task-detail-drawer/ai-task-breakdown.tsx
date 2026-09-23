'use client';

import { useCallback, useState } from 'react';

import Button from '@atlaskit/button/new';
import { Box, Inline, Stack, xcss } from '@atlaskit/primitives';
import { Checkbox } from '@atlaskit/checkbox';

import { AiButton } from '@/components/ai/ai-button';
import { AiModal } from '@/components/ai/ai-modal';
import { AiResponseCard } from '@/components/ai/ai-response-card';
import { useBreakdownTask } from '@/lib/ai/use-breakdown-task';
import type { SubtaskItem } from '@/lib/client';

const footerStyles = xcss({ paddingTop: 'space.200' });
const listStyles = xcss({
  maxHeight: '400px',
  overflowY: 'auto',
  padding: 'space.100',
  border: '1px solid color.border',
});
const subtaskStyles = xcss({
  padding: 'space.100',
});

export interface AiTaskBreakdownProps {
  title: string;
  description?: string | null;
  labels?: string[];
  priority?: string | null;
  sprint?: string | null;
  /** Parent decides how to save subtasks. */
  onAddSubtasks: (subtasks: SubtaskItem[]) => void;
  testId?: string;
}

export function AiTaskBreakdown({
  title,
  description,
  labels,
  priority,
  sprint,
  onAddSubtasks,
  testId,
}: AiTaskBreakdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const { mutate, reset, data, isPending, error } = useBreakdownTask();

  const runGenerate = useCallback(() => {
    setSelectedIndices(new Set());
    mutate({
      title,
      description: description ?? undefined,
      labels,
      priority: priority ?? undefined,
      sprint: sprint ?? undefined,
    });
  }, [mutate, title, description, labels, priority, sprint]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    runGenerate();
  }, [runGenerate]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    reset();
  }, [reset]);

  const handleApply = useCallback(() => {
    if (!data) return;
    const selected = data.subtasks.filter((_, i) => selectedIndices.has(i));
    onAddSubtasks(selected);
    handleClose();
  }, [data, selectedIndices, onAddSubtasks, handleClose]);

  const toggleSelection = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const selectAll = () => {
    if (!data) return;
    if (selectedIndices.size === data.subtasks.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(data.subtasks.map((_, i) => i)));
    }
  };

  return (
    <>
      <AiButton
        onClick={handleOpen}
        isDisabled={title.trim().length === 0}
        testId={testId}
      >
        ✨ Break down task
      </AiButton>
      <AiModal
        isOpen={isOpen}
        onClose={handleClose}
        title="Break down task"
      >
        <Stack space="space.200">
          {data ? (
            <Stack space="space.100">
              <Checkbox
                isChecked={selectedIndices.size > 0 && selectedIndices.size === data.subtasks.length}
                isIndeterminate={selectedIndices.size > 0 && selectedIndices.size < data.subtasks.length}
                onChange={selectAll}
                label="Select all"
              />
              <Box xcss={listStyles} style={{ borderRadius: 6 }}>
                {data.subtasks.map((st, i) => (
                  <Box key={i} xcss={subtaskStyles} style={{ borderBottom: i === data.subtasks.length - 1 ? 'none' : '1px solid var(--trella-border)' }}>
                    <Checkbox
                      isChecked={selectedIndices.has(i)}
                      onChange={() => toggleSelection(i)}
                      label={<strong>{st.title}</strong>}
                    />
                    <Box style={{ paddingLeft: '28px', color: 'var(--ds-text-subtlest)' }}>
                      <p>{st.description}</p>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Stack>
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
                testId="ai-breakdown-cancel"
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleApply}
                isDisabled={!data || selectedIndices.size === 0}
                testId="ai-breakdown-apply"
              >
                Add selected subtasks
              </Button>
            </Inline>
          </Box>
        </Stack>
      </AiModal>
    </>
  );
}
