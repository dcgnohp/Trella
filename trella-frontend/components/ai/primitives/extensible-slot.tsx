'use client';
import { Box, Stack, Text, xcss } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';

const slotStyles = xcss({
  padding: 'space.200',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.sunken',
});

interface ExtensibleSlotProps {
  title: string;
  description?: string;
}

/** A dashed-border teaser reserving space for future analytics. */
export function ExtensibleSlot({ title, description }: ExtensibleSlotProps) {
  return (
    <Box
      xcss={slotStyles}
      style={{ border: `1px dashed ${token('color.border')}` }}
    >
      <Stack space="space.050" alignInline="center">
        <Text weight="medium" color="color.text.subtle">
          {title}
        </Text>
        {description ? (
          <Text size="small" color="color.text.subtlest">
            {description}
          </Text>
        ) : null}
        <Text size="small" color="color.text.subtlest">
          Coming soon
        </Text>
      </Stack>
    </Box>
  );
}
