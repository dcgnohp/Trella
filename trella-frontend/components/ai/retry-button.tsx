'use client';
import Button from '@atlaskit/button/new';

interface RetryButtonProps {
  onRetry: () => void;
  isLoading?: boolean;
  label?: string;
  testId?: string;
}

/** Subtle retry action, used standalone or inside AiResponseCard's error state. */
export function RetryButton({
  onRetry,
  isLoading,
  label = 'Retry',
  testId,
}: RetryButtonProps) {
  return (
    <Button
      appearance="subtle"
      onClick={onRetry}
      isLoading={isLoading}
      testId={testId}
    >
      {label}
    </Button>
  );
}
