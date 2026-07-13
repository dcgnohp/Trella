'use client';
import { Inline } from '@atlaskit/primitives';
import Spinner from '@atlaskit/spinner';
import { token } from '@atlaskit/tokens';

interface AiLoadingProps {
  label?: string;
  size?: 'small' | 'medium' | 'large';
  testId?: string;
}

/** Inline spinner + label for AI pending states. Spacing/color via ADS tokens. */
export function AiLoading({
  label = 'Thinking\u2026',
  size = 'medium',
  testId,
}: AiLoadingProps) {
  return (
    <Inline space="space.100" alignBlock="center" testId={testId}>
      <Spinner size={size} />
      <span style={{ color: token('color.text.subtlest') }}>{label}</span>
    </Inline>
  );
}
