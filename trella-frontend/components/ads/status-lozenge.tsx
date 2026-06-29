'use client';
import Lozenge from '@atlaskit/lozenge';

type CanonicalStatus = 'TODO' | 'IN_PROGRESS' | 'PENDING' | 'DONE' | string;

const appearanceMap: Record<string, 'default' | 'inprogress' | 'moved' | 'success' | 'removed' | 'new'> = {
  TODO: 'default',
  IN_PROGRESS: 'inprogress',
  PENDING: 'moved',
  DONE: 'success',
};

interface StatusLozengeProps {
  status?: CanonicalStatus | null;
  label?: string;
  isBold?: boolean;
}

export function StatusLozenge({ status, label, isBold }: StatusLozengeProps) {
  const canonical = status?.toUpperCase() ?? 'TODO';
  const appearance = appearanceMap[canonical] ?? 'default';
  const displayLabel = label ?? (status ? status.replace('_', ' ') : 'TO DO');
  return <Lozenge appearance={appearance} isBold={isBold}>{displayLabel}</Lozenge>;
}
