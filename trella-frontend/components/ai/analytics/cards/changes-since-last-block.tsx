import { Box, Text, xcss } from '@atlaskit/primitives';

const calloutStyles = xcss({
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'color.background.discovery',
});

interface ChangesSinceLastBlockProps {
  text: string;
}

/** A subtle callout summarising what changed since the last sprint. */
export function ChangesSinceLastBlock({ text }: ChangesSinceLastBlockProps) {
  if (!text) return null;
  return (
    <Box xcss={calloutStyles}>
      <Text size="small">{text}</Text>
    </Box>
  );
}
