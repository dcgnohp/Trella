'use client';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import { token } from '@atlaskit/tokens';

import type { TeamPerformance } from '@/lib/client';

interface TeamPerformanceBlockProps {
  data: TeamPerformance;
}

function BulletRow({ mark, color, text }: { mark: string; color: string; text: string }) {
  return (
    <Inline space="space.100" alignBlock="start">
      <span style={{ color, fontWeight: 600 }}>{mark}</span>
      <Text size="small">{text}</Text>
    </Inline>
  );
}

/** Team performance narrative with highlights (✓) and concerns (!) lists. */
export function TeamPerformanceBlock({ data }: TeamPerformanceBlockProps) {
  const highlights = data.highlights ?? [];
  const concerns = data.concerns ?? [];
  return (
    <Stack space="space.150">
      <Text>{data.summary}</Text>
      {highlights.length > 0 ? (
        <Stack space="space.050">
          {highlights.map((h, i) => (
            <BulletRow key={`h-${i}`} mark="✓" color={token('color.text.success')} text={h} />
          ))}
        </Stack>
      ) : null}
      {concerns.length > 0 ? (
        <Stack space="space.050">
          {concerns.map((c, i) => (
            <BulletRow key={`c-${i}`} mark="!" color={token('color.text.danger')} text={c} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
