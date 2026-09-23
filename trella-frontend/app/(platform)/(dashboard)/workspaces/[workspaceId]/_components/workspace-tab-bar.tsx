'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { token } from '@atlaskit/tokens';
import { Inline, Text } from '@atlaskit/primitives';

interface WorkspaceTabBarProps {
  workspaceId: string;
  boardId?: string;
}

const TABS = [
  { label: 'Summary', path: (wsId: string) => `/workspaces/${wsId}/summary` },
  { label: 'Backlog', path: (wsId: string) => `/workspaces/${wsId}/backlog` },
  { label: 'Board', path: (wsId: string, boardId?: string) => boardId ? `/workspaces/${wsId}/boards/${boardId}` : `/workspaces/${wsId}/boards` },
  { label: 'Timeline', path: (wsId: string) => `/workspaces/${wsId}/timeline` },
];

export function WorkspaceTabBar({ workspaceId, boardId }: WorkspaceTabBarProps) {
  const pathname = usePathname();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      borderBottom: `1px solid ${token('color.border')}`,
      backgroundColor: token('elevation.surface'),
      paddingInline: token('space.400'),
      height: 44,
      flexShrink: 0,
    }}>
      {TABS.map(tab => {
        const href = tab.path(workspaceId, boardId);
        const isActive = tab.label === 'Board'
          ? pathname.includes('/boards/')
          : pathname.endsWith(`/${tab.label.toLowerCase()}`);

        return (
          <Link key={tab.label} href={href} style={{ textDecoration: 'none' }}>
            <div style={{
              padding: `0 ${token('space.200')}`,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              borderBottom: isActive ? `2px solid ${token('color.border.brand')}` : '2px solid transparent',
              marginBottom: -1,
            }}>
              <Text
                size="small"
                weight={isActive ? 'medium' : 'regular'}
                color={isActive ? 'color.text.selected' : 'color.text.subtle'}
              >
                {tab.label}
              </Text>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
