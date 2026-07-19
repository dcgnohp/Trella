'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ShowMoreHorizontalIcon from '@atlaskit/icon/core/show-more-horizontal';
import RefreshIcon from '@atlaskit/icon/core/refresh';
import { BoardsService, WorkspacesService, WorkspaceMembersService } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/components/providers/auth-provider';
import { ConfirmModal } from '@/components/ads/confirm-modal';
import { useWorkspaceMode } from '@/lib/workspace-mode/use-workspace-mode';
import { parseLastVisited, getLastVisitedCookie } from '@/lib/last-visited';
import { useContributeConversationContext } from '@/lib/ai/conversation-context';

const TABS_SCRUM = [
  { label: 'Summary', segment: 'summary' },
  { label: 'List', segment: 'list' },
  { label: 'Board', segment: 'boards' },
  { label: 'Backlog', segment: 'backlog' },
  { label: 'Timeline', segment: 'timeline' },
  { label: 'Docs', segment: 'docs' },
  { label: 'Reports', segment: 'reports' },
  { label: 'Velocity', segment: 'settings/velocity' },
  { label: 'Plans', segment: 'plans' },
];
const TABS_KANBAN = [
  { label: 'Summary', segment: 'summary' },
  { label: 'Board', segment: 'boards' },
  { label: 'Timeline', segment: 'timeline' },
  { label: 'Reports', segment: 'reports' },
  { label: 'Velocity', segment: 'settings/velocity' },
];

interface WorkspaceHeaderProps {
  workspaceId: string;
}

export function WorkspaceHeader({ workspaceId }: WorkspaceHeaderProps) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const boardId = params?.boardId as string | undefined;

  const [spaceName, setSpaceName] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [localScrum, setLocalScrum] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`trella:onboarding:${workspaceId}`);
      if (raw) setSpaceName(JSON.parse(raw).name as string);
    } catch { /* empty */ }
    setLocalScrum(window.localStorage.getItem(`trella:projectType:${workspaceId}`) === 'scrum');
  }, [workspaceId]);

  const modeQuery = useWorkspaceMode(workspaceId);
  const isScrum = modeQuery.data?.mode === 'SCRUM' || localScrum;
  const tabs = isScrum ? TABS_SCRUM : TABS_KANBAN;

  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({ workspaceId }),
  });
  // ponytail: show button while loading, hide only once confirmed not owner
  const isOwner = membersQuery.isLoading || (membersQuery.data?.some(m => m.userId === user?.id && m.role === 'OWNER') ?? false);

  const switchModeMutation = useMutation({
    mutationFn: (nextMode: 'KANBAN' | 'SCRUM') =>
      WorkspacesService.Workspaces_workspacesSwitchWorkspaceMode({
        workspaceId,
        requestBody: { mode: nextMode },
      }),
    onSuccess: (_, nextMode) => {
      window.localStorage.setItem(`trella:projectType:${workspaceId}`, nextMode === 'SCRUM' ? 'scrum' : 'kanban');
      queryClient.invalidateQueries({ queryKey: ['workspace-mode', workspaceId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSprints(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBacklog(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceBoards(workspaceId) });
      toast.success(nextMode === 'SCRUM' ? 'Switched to Scrum' : 'Switched to Kanban');
      router.refresh();
    },
    onError: () => toast.error('Failed to switch workspace mode'),
  });

  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
  });
  const displayName = spaceName || boardsQuery.data?.[0]?.title || 'My Project';

  // Baseline workspace context for the AI chat — reuses already-loaded name +
  // mode, no extra fetch. Must run before the plan-route early return below.
  useContributeConversationContext({
    ids: { workspaceId },
    workspace: { name: displayName, mode: isScrum ? 'SCRUM' : 'KANBAN' },
  });

  const getTabHref = (segment: string) => {
    if (segment === 'boards') {
      if (boardId) return `/workspaces/${workspaceId}/boards/${boardId}`;
      // Fall back to last-visited board for this workspace, then first board
      const lastVisited = parseLastVisited(getLastVisitedCookie());
      const lastBoardId = lastVisited?.workspaceId === workspaceId ? lastVisited.boardId : null;
      const fallbackId = lastBoardId ?? boardsQuery.data?.[0]?.id;
      if (fallbackId) return `/workspaces/${workspaceId}/boards/${fallbackId}`;
      return `/workspaces/${workspaceId}/boards`;
    }
    return `/workspaces/${workspaceId}/${segment}`;
  };

  const isTabActive = (segment: string) => {
    if (segment === 'boards') return pathname.includes('/boards');
    return pathname.includes(`/${segment}`);
  };

  const isPlanRoute = pathname.includes('/plans/') && pathname.split('/plans/')[1]?.length > 0;
  if (isPlanRoute) return null;

  return (
    <>
    <div style={{
      backgroundColor: 'var(--trella-surface)',
      borderBottom: '1px solid var(--trella-border)',
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
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--trella-text)' }}>{displayName}</span>
        <span style={{ color: 'var(--trella-text-subtlest)', display: 'flex', alignItems: 'center', marginLeft: 4, cursor: 'pointer' }}>
          <ShowMoreHorizontalIcon label="More" size="small" />
        </span>

        {isOwner && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={switchModeMutation.isPending}
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px solid var(--trella-border)', borderRadius: 4,
              padding: '4px 10px', height: 28, fontSize: 12, color: 'var(--trella-text-subtle)',
              cursor: switchModeMutation.isPending ? 'default' : 'pointer',
            }}
          >
            <RefreshIcon label="" size="small" />
            Switch to {isScrum ? 'Kanban' : 'Scrum'}
          </button>
        )}
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
                color: active ? 'var(--trella-text)' : 'var(--trella-text-subtle)',
                borderBottom: active ? '2px solid var(--trella-brand)' : '2px solid transparent',
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
    <ConfirmModal
      isOpen={confirmOpen}
      title={isScrum ? 'Switch to Kanban?' : 'Switch to Scrum?'}
      body={
        isScrum
          ? (
            <div>
              <p style={{ margin: '0 0 10px' }}>
                ⚠️ <strong>Một số tính năng sẽ không còn hiển thị:</strong>
              </p>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20, lineHeight: 1.7 }}>
                <li>Tab <strong>Backlog</strong> và <strong>Docs</strong> sẽ bị ẩn.</li>
                <li>Kanban không có Backlog riêng: các task đang ở <strong>Backlog</strong> (chưa gán sprint) sẽ <strong>hiển thị trực tiếp trên board</strong> cùng các task khác.</li>
                <li>Story point, assignee, priority của tất cả task <strong>được giữ nguyên</strong>.</li>
              </ul>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--trella-text-subtle)' }}>
                Chuyển lại về Scrum bất cứ lúc nào để truy cập lại Backlog.
              </p>
            </div>
          )
          : 'A default "Sprint 1" will be created and all tasks will move to the Backlog. Story points, assignees and priorities are kept as-is.'
      }
      confirmLabel="Switch"
      onConfirm={() => {
        setConfirmOpen(false);
        switchModeMutation.mutate(isScrum ? 'KANBAN' : 'SCRUM');
      }}
      onClose={() => setConfirmOpen(false)}
    />
    </>
  );
}
