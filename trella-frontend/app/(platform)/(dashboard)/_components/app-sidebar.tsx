'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { OrganizationPublic } from '@/lib/client';
import { useSidebar } from './dashboard-shell';

// ADS icons — new icon package uses /core/ path (not /glyph/)
import HomeIcon from '@atlaskit/icon/core/home';
import AppsIcon from '@atlaskit/icon/core/apps';
import RoadmapIcon from '@atlaskit/icon/core/roadmap';
import FilterIcon from '@atlaskit/icon/core/filter';
import DashboardIcon from '@atlaskit/icon/core/dashboard';
import PeopleGroupIcon from '@atlaskit/icon/core/people-group';
import FolderOpenIcon from '@atlaskit/icon/core/folder-open';
import SettingsIcon from '@atlaskit/icon/core/settings';
import AddIcon from '@atlaskit/icon/core/add';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import BoardIcon from '@atlaskit/icon/core/board';
import ArrowLeftIcon from '@atlaskit/icon/core/arrow-left';
import ArrowRightIcon from '@atlaskit/icon/core/arrow-right';
import LinkExternalIcon from '@atlaskit/icon/core/link-external';

const S = {
  bg: '#FFFFFF',
  hover: 'rgba(9,30,66,0.04)',
  active: 'rgba(9,30,66,0.08)',
  activeBorder: '#0052CC',
  text: '#5E6C84',
  textActive: '#172B4D',
  textMuted: '#7A869A',
  border: '#DFE1E6',
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
}

function NavItem({ href, icon, label, isActive, rightEl, collapsed }: NavItemProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        title={collapsed ? label : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
          padding: collapsed ? '7px 0' : '7px 12px 7px 14px',
          justifyContent: collapsed ? 'center' : undefined,
          margin: '1px 0',
          borderRadius: 4,
          backgroundColor: isActive ? S.active : hovered ? S.hover : 'transparent',
          borderLeft: collapsed ? 'none' : (isActive ? `2px solid ${S.activeBorder}` : '2px solid transparent'),
          color: isActive ? S.textActive : S.text,
          fontSize: 14,
          fontWeight: isActive ? 500 : 400,
          cursor: 'pointer',
          transition: 'background 0.1s',
        }}
      >
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: isActive ? S.textActive : S.text }}>{icon}</span>
        {!collapsed && (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        )}
        {!collapsed && rightEl && <span style={{ marginLeft: 'auto' }}>{rightEl}</span>}
      </div>
    </Link>
  );
}

function ExpandableSection({ label, children, defaultOpen = false, collapsed }: { label: string; children: React.ReactNode; defaultOpen?: boolean; collapsed?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (collapsed) return <>{children}</>;
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 12px 6px 14px', color: S.textMuted, fontSize: 12, fontWeight: 500,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', color: S.textMuted }}>
          {open ? <ChevronDownIcon label="" size="small" /> : <ChevronRightIcon label="" size="small" />}
        </span>
        {label}
      </button>
      {open && children}
    </div>
  );
}

export function AppSidebar({ workspaceId, projectType: _projectType, userRole, collapsed }: AppSidebarProps) {
  const pathname = usePathname();
  const { toggle } = useSidebar();

  const orgQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: async (): Promise<OrgResponse> => {
      const res = await fetch('/api/org', { cache: 'no-store' });
      if (!res.ok) return { organizations: [], currentOrgId: null };
      return res.json();
    },
  });

  const organizations = orgQuery.data?.organizations ?? [];

  const width = collapsed ? 56 : 264;

  return (
    <div style={{
      width,
      height: '100%',
      backgroundColor: S.bg,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      borderRight: `1px solid ${S.border}`,
      transition: 'width 0.2s ease',
    }}>
      {/* Collapse toggle */}
      <div style={{
        display: 'flex',
        justifyContent: collapsed ? 'center' : 'flex-end',
        padding: collapsed ? '10px 0' : '10px 12px',
        borderBottom: `1px solid ${S.border}`,
      }}>
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: S.textMuted, display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = S.hover)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {collapsed ? <ArrowRightIcon label="Expand" size="small" /> : <ArrowLeftIcon label="Collapse" size="small" />}
        </button>
      </div>

      <div style={{ padding: '8px 4px' }}>
        {/* Global nav */}
        <NavItem href="/organization" icon={<HomeIcon label="Home" size="small" />} label="For you" isActive={pathname === '/organization'} collapsed={collapsed} />

        <ExpandableSection label="Recent" defaultOpen collapsed={collapsed}>
          {organizations.slice(0, 3).map(org => (
            <NavItem
              key={org.id}
              href={`/organization/${org.id}`}
              icon={
                <div style={{ width: 18, height: 18, borderRadius: 4, background: 'linear-gradient(135deg,#0052CC,#6554C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {org.name.charAt(0).toUpperCase()}
                </div>
              }
              label={org.name}
              isActive={pathname.includes(`/organization/${org.id}`)}
              collapsed={collapsed}
            />
          ))}
        </ExpandableSection>

        <ExpandableSection label="Starred" collapsed={collapsed}>
          <div style={{ padding: collapsed ? 0 : '4px 16px 8px', fontSize: 13, color: S.textMuted, display: collapsed ? 'none' : undefined }}>No starred items</div>
        </ExpandableSection>

        <div style={{ height: 1, backgroundColor: S.border, margin: '8px 6px' }} />

        <NavItem href="/organization" icon={<AppsIcon label="Apps" size="small" />} label="Apps" collapsed={collapsed} />
        <NavItem href="#" icon={<RoadmapIcon label="Plans" size="small" />} label="Plans" collapsed={collapsed} />

        <div style={{ height: 1, backgroundColor: S.border, margin: '8px 6px' }} />

        {/* Spaces heading */}
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px 4px 16px' }}>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: S.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Spaces</span>
            <Link href="/select-org" style={{ textDecoration: 'none', display: 'flex', color: S.textMuted }}>
              <AddIcon label="Create workspace" size="small" />
            </Link>
          </div>
        )}

        {/* Workspace list */}
        {orgQuery.isLoading ? (
          !collapsed && (
            <div style={{ padding: '4px 16px' }}>
              {[1, 2].map(i => <div key={i} style={{ height: 28, borderRadius: 4, backgroundColor: S.hover, marginBottom: 4 }} />)}
            </div>
          )
        ) : (
          organizations.map(org => (
            <NavItem
              key={org.id}
              href={`/organization/${org.id}`}
              icon={
                <div style={{ width: 18, height: 18, borderRadius: 4, background: 'linear-gradient(135deg,#0052CC,#6554C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {org.name.charAt(0).toUpperCase()}
                </div>
              }
              label={org.name}
              isActive={pathname.includes(`/organization/${org.id}`)}
              collapsed={collapsed}
            />
          ))
        )}

        {/* Board + Status Mapping links when in a workspace */}
        {workspaceId && (
          <NavItem
            href={`/workspaces/${workspaceId}/boards`}
            icon={<BoardIcon label="Board" size="small" />}
            label="Board"
            isActive={pathname.includes('/boards')}
            collapsed={collapsed}
          />
        )}

        <div style={{ height: 1, backgroundColor: S.border, margin: '8px 6px' }} />

        <NavItem href="#" icon={<FilterIcon label="Filters" size="small" />} label="Filters" collapsed={collapsed} />
        <NavItem href="#" icon={<DashboardIcon label="Dashboards" size="small" />} label="Dashboards" collapsed={collapsed} />
        <NavItem href="#" icon={<PeopleGroupIcon label="Teams" size="small" />} label="Teams" collapsed={collapsed} rightEl={!collapsed ? <span style={{ display: 'flex', alignItems: 'center', color: S.textMuted }}><LinkExternalIcon label="" size="small" /></span> : undefined} />
        <NavItem href="#" icon={<FolderOpenIcon label="Projects" size="small" />} label="Projects" collapsed={collapsed} rightEl={!collapsed ? <span style={{ display: 'flex', alignItems: 'center', color: S.textMuted }}><LinkExternalIcon label="" size="small" /></span> : undefined} />

        <div style={{ height: 1, backgroundColor: S.border, margin: '8px 6px' }} />

        <NavItem href="#" icon={<SettingsIcon label="Settings" size="small" />} label="Customize sidebar" collapsed={collapsed} />
      </div>
    </div>
  );
}
