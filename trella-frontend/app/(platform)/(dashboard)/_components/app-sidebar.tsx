'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Home,
  LayoutDashboard,
  Kanban,
  FolderKanban,
  Users,
  Settings,
  Plus,
  ChevronDown,
  Layers,
  Check,
  Building2,
} from 'lucide-react';

import type { OrganizationPublic } from '@/lib/client';
import { BoardsService, PlansService } from '@/lib/client';
import { queryKeys } from '@/lib/query-keys';
import { parseLastVisited, getLastVisitedCookie } from '@/lib/last-visited';
import { useSidebar } from './dashboard-shell';
import { useWorkspaceMode } from '@/lib/workspace-mode/use-workspace-mode';
import { CreatePlanWizard } from '@/app/(platform)/(dashboard)/workspaces/[workspaceId]/plans/_components/create-plan-wizard';
import { FormPopover } from '@/components/form/form-popover';

const S = {
  bg: 'var(--trella-surface, #FFFFFF)',
  hover: 'var(--trella-surface-hover, #F1F5F9)',
  active: 'var(--trella-surface-selected, #EFF6FF)',
  activeColor: 'var(--trella-brand, #2563EB)',
  text: 'var(--trella-text-subtle, #475569)',
  textActive: 'var(--trella-text, #0F172A)',
  textMuted: 'var(--trella-text-subtlest, #94A3B8)',
  border: 'var(--trella-border, #E2E8F0)',
};

type OrgResponse = { organizations?: OrganizationPublic[]; currentOrgId?: string | null };

interface AppSidebarProps {
  workspaceId?: string | null;
  projectType?: 'kanban' | 'scrum' | null;
  userRole?: 'ADMIN' | 'OWNER' | 'MEMBER' | null;
  collapsed?: boolean;
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  rightEl?: React.ReactNode;
  collapsed?: boolean;
  onClick?: () => void;
}

function NavItem({ href, icon, label, isActive, rightEl, collapsed, onClick }: NavItemProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href} onClick={onClick} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        title={collapsed ? label : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 10,
          padding: collapsed ? '8px 0' : '8px 12px',
          justifyContent: collapsed ? 'center' : undefined,
          margin: '2px 0',
          borderRadius: 6,
          backgroundColor: isActive ? S.active : hovered ? S.hover : 'transparent',
          color: isActive ? S.activeColor : hovered ? S.textActive : S.text,
          fontSize: 13,
          fontWeight: isActive ? 700 : 500,
          cursor: 'pointer',
          transition: 'all 120ms ease',
        }}
      >
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: isActive ? S.activeColor : hovered ? S.textActive : S.text }}>
          {icon}
        </span>
        {!collapsed && (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        )}
        {!collapsed && rightEl && <span style={{ marginLeft: 'auto' }}>{rightEl}</span>}
      </div>
    </Link>
  );
}

export function AppSidebar({ workspaceId, projectType: _projectType, userRole, collapsed }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toggle } = useSidebar();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const orgMenuRef = useRef<HTMLDivElement>(null);

  const modeQuery = useWorkspaceMode(workspaceId ?? '');
  const isKanban = modeQuery.data?.mode === 'KANBAN' || _projectType === 'kanban';

  // Queries
  const orgQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: async (): Promise<OrgResponse> => {
      const res = await fetch('/api/org', { cache: 'no-store' });
      if (!res.ok) return { organizations: [], currentOrgId: null };
      return res.json();
    },
  });

  const boardsQuery = useQuery({
    queryKey: queryKeys.workspaceBoards(workspaceId ?? ''),
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId! }),
    enabled: !!workspaceId,
  });

  // Active Board Link
  const activeBoardHref = React.useMemo(() => {
    if (!workspaceId) return null;
    const match = pathname.match(/\/boards\/([^/]+)/);
    if (match) return `/workspaces/${workspaceId}/boards/${match[1]}`;
    const lastVisited = parseLastVisited(getLastVisitedCookie());
    const lastBoardId = lastVisited?.workspaceId === workspaceId ? lastVisited.boardId : null;
    const fallbackId = lastBoardId ?? boardsQuery.data?.[0]?.id;
    return fallbackId ? `/workspaces/${workspaceId}/boards/${fallbackId}` : null;
  }, [workspaceId, pathname, boardsQuery.data]);

  const organizations = orgQuery.data?.organizations ?? [];
  const currentOrg = organizations.find(o => o.id === workspaceId) || organizations[0] || { id: workspaceId, name: 'abg team' };

  // Close Org Dropdown when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) {
        setOrgMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, []);

  const width = collapsed ? 60 : 250;

  return (
    <div
      style={{
        width,
        height: '100%',
        backgroundColor: S.bg,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        borderRight: `1px solid ${S.border}`,
        transition: 'width 200ms ease',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* 1. Clean Header with Workspace Switcher & Collapse Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '12px 0' : '12px 14px',
          borderBottom: `1px solid ${S.border}`,
          minHeight: 56,
        }}
      >
        {!collapsed ? (
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }} ref={orgMenuRef}>
            <button
              onClick={() => setOrgMenuOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '4px 6px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderRadius: 6,
                textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = S.hover)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {currentOrg.name ? currentOrg.name.charAt(0).toUpperCase() : 'T'}
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--trella-text, #0F172A)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: 1,
                }}
              >
                {currentOrg.name}
              </span>
              <ChevronDown size={14} color="var(--trella-text-subtlest, #64748B)" />
            </button>

            {/* Dropdown Menu for Workspace Switcher */}
            {orgMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  width: 220,
                  backgroundColor: 'var(--trella-surface-overlay, #FFFFFF)',
                  border: `1px solid ${S.border}`,
                  borderRadius: 8,
                  boxShadow: 'var(--trella-shadow-overlay, 0 10px 25px rgba(0,0,0,0.12))',
                  zIndex: 9999,
                  padding: 4,
                  animation: 'fadeScaleIn 120ms ease-out forwards',
                }}
              >
                <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: S.textMuted, textTransform: 'uppercase' }}>
                  Switch Workspace
                </div>
                {organizations.map(org => (
                  <div
                    key={org.id}
                    onClick={async () => {
                      setOrgMenuOpen(false);
                      try {
                        await fetch('/api/org', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ orgId: org.id }),
                        });
                      } catch { /* empty */ }
                      router.push(`/organization/${org.id}`);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: org.id === workspaceId ? 700 : 500,
                      color: org.id === workspaceId ? 'var(--trella-brand, #2563EB)' : 'var(--trella-text, #334155)',
                      cursor: 'pointer',
                      backgroundColor: org.id === workspaceId ? S.active : 'transparent',
                    }}
                    onMouseEnter={e => { if (org.id !== workspaceId) e.currentTarget.style.backgroundColor = S.hover; }}
                    onMouseLeave={e => { if (org.id !== workspaceId) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: org.id === workspaceId ? 'var(--trella-brand, #2563EB)' : 'var(--trella-text-subtlest, #94A3B8)', color: '#FFFFFF', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <span>{org.name}</span>
                    </div>
                    {org.id === workspaceId && <Check size={14} color="var(--trella-brand, #2563EB)" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={toggle}
            title="Expand sidebar"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: S.active,
              color: S.activeColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(37,99,235,0.15)',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = S.hover)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = S.active)}
          >
            <PanelLeftOpen size={18} />
          </div>
        )}

        {!collapsed && (
          <button
            onClick={toggle}
            title="Collapse sidebar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: S.textMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
              borderRadius: 6,
              marginLeft: 4,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = S.hover;
              e.currentTarget.style.color = S.textActive;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = S.textMuted;
            }}
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* 2. Logical Non-Duplicated Navigation Menu */}
      <div style={{ padding: collapsed ? '12px 6px' : '12px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        
        {/* Global Feed / Workspace Home */}
        <NavItem
          href={workspaceId ? `/organization/${workspaceId}` : "/organization"}
          icon={<Home size={18} />}
          label="For you"
          isActive={pathname === '/organization' || (!!workspaceId && pathname === `/organization/${workspaceId}`)}
          collapsed={collapsed}
        />

        {/* Workspace Specific Section */}
        {workspaceId && (
          <>
            {!collapsed && (
              <div style={{ padding: '12px 8px 4px', fontSize: 10, fontWeight: 700, color: S.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                WORKSPACE: {currentOrg.name}
              </div>
            )}

            <NavItem
              href={`/organization/${workspaceId}/boards`}
              icon={<Kanban size={18} />}
              label="Board"
              isActive={pathname.includes('/boards') || pathname.includes('/organization/')}
              collapsed={collapsed}
            />
            {isKanban && !collapsed && (
              <SidebarBoardList
                boards={boardsQuery.data ?? []}
                workspaceId={workspaceId!}
                pathname={pathname}
                S={S}
              />
            )}

            {!isKanban && (
              <NavItem
                href={`/workspaces/${workspaceId}/plans`}
                icon={<Layers size={18} />}
                label="Plans & Roadmap"
                isActive={pathname.includes('/plans')}
                collapsed={collapsed}
                rightEl={
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsWizardOpen(true);
                    }}
                    title="Create Plan"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textMuted, padding: 2, display: 'flex', alignItems: 'center' }}
                  >
                    <Plus size={14} />
                  </button>
                }
              />
            )}

            <NavItem
              href={`/workspaces/${workspaceId}/settings/members`}
              icon={<Users size={18} />}
              label="Members & Permissions"
              isActive={pathname.includes('/settings/members')}
              collapsed={collapsed}
            />
          </>
        )}

        {/* Separator */}
        <div style={{ height: 1, backgroundColor: S.border, margin: '10px 4px' }} />

        {/* System & Options */}
        {!collapsed && (
          <div style={{ padding: '4px 8px 4px', fontSize: 10, fontWeight: 700, color: S.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            System
          </div>
        )}

        <NavItem href="#" icon={<LayoutDashboard size={18} />} label="Dashboards" collapsed={collapsed} />
        <NavItem href="#" icon={<Settings size={18} />} label="Settings" collapsed={collapsed} />
      </div>

      {/* Create Plan Wizard Modal */}
      <CreatePlanWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        workspaceId={workspaceId ?? ''}
        prefill={false}
      />
    </div>
  );
}

/* ── Scrollable Board List (fixed 5-item viewport, auto-scroll to active) ── */
const ITEM_HEIGHT = 28; // px per board item (padding + font + gap)
const VISIBLE_COUNT = 5;

function SidebarBoardList({ boards, workspaceId, pathname, S }: { boards: { id: string; title: string }[]; workspaceId: string; pathname: string; S: Record<string, string> }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const total = boards.length;

  // Find active board index
  const activeIndex = React.useMemo(
    () => boards.findIndex(b => pathname.includes(b.id)),
    [boards, pathname],
  );

  // On mount & when active board changes, scroll it into view (centered)
  React.useEffect(() => {
    if (!scrollRef.current || activeIndex < 0) return;
    const container = scrollRef.current;
    // Scroll so the active item is roughly in the center of the 5-item viewport
    const targetScroll = (activeIndex * ITEM_HEIGHT) - (Math.floor(VISIBLE_COUNT / 2) * ITEM_HEIGHT);
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [activeIndex]);

  // If 5 or fewer boards, no scroll needed — show all naturally
  const needsScroll = total > VISIBLE_COUNT;

  return (
    <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 6 }}>
      {/* Board list — fixed-height scrollable viewport */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: needsScroll ? ITEM_HEIGHT * VISIBLE_COUNT : undefined,
          overflowY: needsScroll ? 'auto' : undefined,
          display: 'flex', flexDirection: 'column',
          scrollbarWidth: 'thin',
        }}
      >
        {boards.map(board => {
          const boardHref = `/workspaces/${workspaceId}/boards/${board.id}`;
          const isBoardActive = pathname.includes(board.id);
          return (
            <Link key={board.id} href={boardHref} style={{ textDecoration: 'none' }}>
              <div style={{
                height: ITEM_HEIGHT,
                padding: '0 8px',
                fontSize: 12,
                borderRadius: 4,
                color: isBoardActive ? S.activeColor : S.text,
                backgroundColor: isBoardActive ? S.active : 'transparent',
                fontWeight: isBoardActive ? 600 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center',
                boxSizing: 'border-box',
              }}>
                • {board.title}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Create new board */}
      <FormPopover side="right" align="start" sideOffset={10}>
        <div
          role="button"
          style={{
            fontSize: 12,
            color: 'var(--trella-brand, #2563EB)',
            padding: '5px 8px',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 4,
            marginTop: 2,
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = S.hover)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Plus size={14} />
          <span>Create new board</span>
        </div>
      </FormPopover>
    </div>
  );
}


