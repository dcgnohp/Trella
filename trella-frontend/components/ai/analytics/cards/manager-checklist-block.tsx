'use client';
import { useState } from 'react';

import { Checkbox } from '@atlaskit/checkbox';
import { Inline, Stack } from '@atlaskit/primitives';

import type { ChecklistItem } from '@/lib/client';
import { PriorityBadge } from '@/components/ai/primitives/priority-badge';

interface ManagerChecklistBlockProps {
  items: ChecklistItem[];
}

/**
 * Manager checklist: a checkbox per item with an optional priority badge.
 * Checked state is local/visual only and is not persisted.
 */
export function ManagerChecklistBlock({ items }: ManagerChecklistBlockProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  if (items.length === 0) return null;

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <Stack space="space.075">
      {items.map((item, i) => (
        <Inline key={`check-${i}`} space="space.100" alignBlock="center">
          <Checkbox
            isChecked={checked.has(i)}
            onChange={() => toggle(i)}
            label={item.label}
          />
          {item.priority ? <PriorityBadge priority={item.priority} /> : null}
        </Inline>
      ))}
    </Stack>
  );
}
