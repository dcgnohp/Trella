'use client';
import Button from '@atlaskit/button/new';
import type { ReactNode } from 'react';

interface AiButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  appearance?: 'primary' | 'default' | 'subtle';
  children: ReactNode;
  testId?: string;
}

/** Consistent entry-point button for AI actions. Gets its loading spinner and
 *  color tokens from the ADS Button. */
export function AiButton({
  onClick,
  isLoading,
  isDisabled,
  appearance = 'primary',
  children,
  testId,
}: AiButtonProps) {
  return (
    <Button
      appearance={appearance}
      isLoading={isLoading}
      isDisabled={isDisabled}
      onClick={onClick}
      testId={testId}
    >
      {children}
    </Button>
  );
}
