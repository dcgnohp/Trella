'use client';
import type { ReactNode } from 'react';

import { token } from '@atlaskit/tokens';

interface MetricStripProps {
  children: ReactNode;
}

/** Responsive grid of MetricCards (auto-fit, min 150px per column). */
export function MetricStrip({ children }: MetricStripProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: token('space.200'),
      }}
    >
      {children}
    </div>
  );
}
