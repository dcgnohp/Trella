'use client';
import { Box, Inline, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';

type Priority = 'Low' | 'Medium' | 'High' | 'Urgent' | string;

const colorMap: Record<string, string> = {
  Low: token('color.text.information'),
  Medium: token('color.text.warning'),
  High: token('color.text.danger'),
  Urgent: token('color.text.danger'),
};

const bgMap: Record<string, string> = {
  Low: token('color.background.information'),
  Medium: token('color.background.warning'),
  High: token('color.background.danger'),
  Urgent: token('color.background.danger'),
};

interface PriorityIndicatorProps {
  priority: Priority;
  showLabel?: boolean;
}

export function PriorityIndicator({ priority, showLabel = true }: PriorityIndicatorProps) {
  const color = colorMap[priority] ?? token('color.text.subtlest');
  const bg = bgMap[priority] ?? token('color.background.neutral');

  return (
    <Inline space="space.050" alignBlock="center">
      <Box
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: bg,
          border: `1.5px solid ${color}`,
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <Text size="small" color="color.text.subtlest">{priority}</Text>
      )}
    </Inline>
  );
}
