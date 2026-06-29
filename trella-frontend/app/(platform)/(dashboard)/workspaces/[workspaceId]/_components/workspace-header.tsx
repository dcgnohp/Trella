'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import ShowMoreHorizontalIcon from '@atlaskit/icon/core/show-more-horizontal';
import { BoardsService } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';

const TABS_SCRUM = [
  { label: 'Summary', segment: 'summary' },
  { label: 'Backlog', segment: 'backlog' },
  { label: 'Board', segment: 'boards' },
  { label: 'Timeline', segment: 'timeline' },
];
const TABS_KANBAN = [
  { label: 'Board', segment: 'boards' },
];

interface WorkspaceHeaderProps {
  workspaceId: string;
}

export function WorkspaceHeader({ workspaceId }: WorkspaceHeaderProps) {
  const pathname = usePathname();
  const params = useParams();
  const boardId = params?.boardId as string | undefined;

  const projectType = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(`trella:projectType:${workspaceId}`) as 'kanban' | 'scrum' | null;
  }, [workspaceId]);

  const isScrum = projectType === 'scrum';
  const tabs = isScrum ? TABS_SCRUM : TABS_KANBAN;

  // Get name from localStorage onboarding data, fallback to board title
  const spaceName = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(`trella:onboarding:${workspaceId}`);
      if (raw) return JSON.parse(raw).name as string;
    } catch { /* empty */ }
    return null;
  }, [workspaceId]);

  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
  });
  const displayName = spaceName || boardsQuery.data?.[0]?.title || 'My Project';

  const getTabHref = (segment: string) => {
    if (segment === 'boards') {
      if (boardId) return `/workspaces/${workspaceId}/boards/${boardId}`;
      if (boardsQuery.data?.[0]) return `/workspaces/${workspaceId}/boards/${boardsQuery.data[0].id}`;
      return `/workspaces/${workspaceId}/boards`;
    }
    return `/workspaces/${workspaceId}/${segment}`;
  };

  const isTabActive = (segment: string) => {
    if (segment === 'boards') return pathname.includes('/boards');
    return pathname.includes(`/${segment}`);
  };

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderBottom: '1px solid #DFE1E6',
      flexShrink: 0,
    }}>
      {/* Project title row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 24px 0',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'linear-gradient(135deg,#0052CC,#6554C0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: 'white', fontWeight: 700, flexShrink: 0,
        }}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#172B4D' }}>{displayName}</span>
        <span style={{ color: '#97A0AF', display: 'flex', alignItems: 'center', marginLeft: 4, cursor: 'pointer' }}>
          <ShowMoreHorizontalIcon label="More" size="small" />
        </span>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', paddingInline: 16, marginTop: 4 }}>
        {tabs.map(tab => {
          const active = isTabActive(tab.segment);
          return (
            <Link key={tab.label} href={getTabHref(tab.segment)} style={{ textDecoration: 'none' }}>
              <div style={{
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? '#172B4D' : '#5E6C84',
                borderBottom: active ? '2px solid #0052CC' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                transition: 'color 0.12s',
              }}>
                {tab.label}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
