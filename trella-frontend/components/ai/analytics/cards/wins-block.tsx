import StatusSuccessIcon from '@atlaskit/icon/core/status-success';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';

interface WinsBlockProps {
  wins: string[];
}

/** Sprint wins: one row per win, each marked with a success icon. */
export function WinsBlock({ wins }: WinsBlockProps) {
  if (wins.length === 0) return null;
  return (
    <Stack space="space.050">
      {wins.map((win, i) => (
        <Inline key={`win-${i}`} space="space.100" alignBlock="start">
          <StatusSuccessIcon label="" color={token('color.icon.success')} />
          <Text size="small">{win}</Text>
        </Inline>
      ))}
    </Stack>
  );
}
