'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import NotificationIcon from '@atlaskit/icon/core/notification';
import SettingsIcon from '@atlaskit/icon/core/settings';
import SearchIcon from '@atlaskit/icon/core/search';
import AddIcon from '@atlaskit/icon/core/add';
import PersonAvatarIcon from '@atlaskit/icon/core/person-avatar';
import ScreenIcon from '@atlaskit/icon/core/screen';
import AppsIcon from '@atlaskit/icon/core/apps';
import GlobeIcon from '@atlaskit/icon/core/globe';
import WorkItemsIcon from '@atlaskit/icon/core/work-items';
import StoreIcon from '@atlaskit/icon/core/app-switcher';
import PeopleGroupIcon from '@atlaskit/icon/core/people-group';
import CreditCardIcon from '@atlaskit/icon/core/credit-card';

import { ThemeToggle, ThemeMenu } from '@/components/theme-toggle';
import { CreateTaskModal } from '@/components/create-task-modal';

const SETTINGS_SECTIONS = [
  {
    heading: 'Personal settings',
    items: [
      { icon: <PersonAvatarIcon label="" size="small" />, label: 'General settings', sub: 'Manage language, time zone, and other personal preferences', href: null },
      { icon: <NotificationIcon label="" size="small" />, label: 'Notification settings', sub: 'Manage email and in-app notifications', href: null },
    ],
  },
  {
    heading: 'Admin settings',
    items: [
      { icon: <ScreenIcon label="" size="small" />, label: 'System', sub: 'Manage general configuration, security, automation, user interface, and more', href: null },
      { icon: <AppsIcon label="" size="small" />, label: 'Apps', sub: 'Manage access, settings, and integrations', href: null },
      { icon: <GlobeIcon label="" size="small" />, label: 'Spaces', sub: 'Manage space settings, categories, and more', href: null },
      { icon: <WorkItemsIcon label="" size="small" />, label: 'Work items', sub: 'Configure work types, workflows, screens, fields, and more', href: null },
      { icon: <StoreIcon label="" size="small" />, label: 'Marketplace apps', sub: 'Add and manage Marketplace apps and integrations', href: null },
    ],
  },
  {
    heading: 'Organization settings',
    items: [
      { icon: <PeopleGroupIcon label="" size="small" />, label: 'User management', sub: 'Create and manage users, groups, and access requests', href: 'members' },
      { icon: <CreditCardIcon label="" size="small" />, label: 'Billing', sub: 'Update your billing details, manage subscriptions, and more', href: null },
    ],
  },
];

export function AppNavbar() {
  const [createOpen, setCreateOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const params = useParams();
  const workspaceId = params?.workspaceId as string | undefined;

  return (
    <div style={{
      height: 56,
      backgroundColor: 'var(--trella-surface)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 8,
      flexShrink: 0,
      borderBottom: '1px solid var(--trella-border)',
      position: 'relative',
      zIndex: 40,
    }}>
      {/* Logo */}
      <Link href="/organization" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'linear-gradient(135deg, #0052CC 0%, #0747A6 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>T</span>
        </div>
        <span style={{ color: 'var(--trella-text)', fontSize: 15, fontWeight: 700 }}>Trella</span>
      </Link>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 480, position: 'relative' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          backgroundColor: 'var(--trella-surface-sunken)',
          border: '1px solid var(--trella-border)',
          borderRadius: 4,
          padding: '0 12px',
          height: 32,
          cursor: 'text',
        }}>
          <span style={{ color: 'var(--trella-text-subtlest)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <SearchIcon label="Search" size="small" />
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search"
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--trella-text)', fontSize: 13, flex: 1,
            }}
          />
          <span style={{ color: 'var(--trella-text-subtlest)', fontSize: 11, fontFamily: 'monospace' }}>/</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Create button */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setCreateOpen(v => !v)}
          style={{
            background: 'var(--trella-brand)', color: 'white', border: 'none', borderRadius: 4,
            padding: '0 14px', height: 32, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <AddIcon label="" size="small" /> Create
        </button>
        {createOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setCreateOpen(false)} />
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 6,
              backgroundColor: 'var(--trella-surface-overlay)', borderRadius: 6,
              boxShadow: 'var(--trella-shadow-raised)',
              padding: '8px 0', minWidth: 200, zIndex: 50,
              border: '1px solid var(--trella-border)',
            }}>
              <div style={{ padding: '4px 16px 8px', fontSize: 11, fontWeight: 700, color: 'var(--trella-text-subtlest)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Create</div>
              {workspaceId && (
                <NavDropButton label="New Task" onClose={() => setCreateOpen(false)} onClick={() => { setCreateOpen(false); setCreateTaskOpen(true); }} />
              )}
              <NavDropItem href="/onboarding" label="New Workspace" onClose={() => setCreateOpen(false)} />
            </div>
          </>
        )}
      </div>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Notification */}
      <IconBtn title="Notifications">
        <NotificationIcon label="Notifications" size="small" />
      </IconBtn>

      {/* Settings — popup matching Jira */}
      <div style={{ position: 'relative' }}>
        <IconBtn title="Settings" onClick={() => setSettingsOpen(v => !v)}>
          <SettingsIcon label="Settings" size="small" />
        </IconBtn>

        {settingsOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setSettingsOpen(false)} />
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 6,
              backgroundColor: 'var(--trella-surface-overlay)', borderRadius: 6,
              boxShadow: 'var(--trella-shadow-overlay)',
              padding: '12px 0', width: 420, zIndex: 50,
              border: '1px solid var(--trella-border)', maxHeight: '80vh', overflowY: 'auto',
            }}>
              {/* Search inside settings */}
              <div style={{ padding: '0 16px 12px', borderBottom: '1px solid var(--trella-border)', marginBottom: 8 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, height: 32,
                  border: '1px solid var(--trella-border)', borderRadius: 4, padding: '0 10px',
                  backgroundColor: 'var(--trella-surface-sunken)',
                }}>
                  <span style={{ color: 'var(--trella-text-subtlest)', display: 'flex' }}><SearchIcon label="" size="small" /></span>
                  <input placeholder="Search" style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, flex: 1, color: 'var(--trella-text)' }} />
                  <span style={{ fontSize: 11, color: 'var(--trella-text-subtlest)', fontFamily: 'monospace' }}>Ctrl K</span>
                </div>
              </div>

              {/* Theme picker */}
              <div style={{ borderBottom: '1px solid var(--trella-border)', marginBottom: 8, paddingBottom: 4 }}>
                <ThemeMenu onSelect={() => setSettingsOpen(false)} />
              </div>

              {SETTINGS_SECTIONS.map(section => (
                <div key={section.heading} style={{ marginBottom: 4 }}>
                  <div style={{ padding: '4px 16px 6px', fontSize: 11, fontWeight: 700, color: 'var(--trella-text-subtlest)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {section.heading}
                  </div>
                  {section.items.map(item => {
                    const href = item.href && workspaceId
                      ? `/workspaces/${workspaceId}/settings/${item.href}`
                      : null;
                    return (
                      <SettingsMenuItem
                        key={item.label}
                        icon={item.icon}
                        label={item.label}
                        sub={item.sub}
                        href={href}
                        onClose={() => setSettingsOpen(false)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'linear-gradient(135deg, #0052CC 0%, #6554C0 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
      }}>
        KS
      </div>

      {workspaceId && (
        <CreateTaskModal
          workspaceId={workspaceId}
          isOpen={createTaskOpen}
          onClose={() => setCreateTaskOpen(false)}
        />
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--trella-surface-hover)' : 'none',
        border: 'none', cursor: 'pointer', color: 'var(--trella-text-subtle)',
        width: 32, height: 32, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.1s',
      }}
    >
      {children}
    </button>
  );
}

function SettingsMenuItem({ icon, label, sub, href, onClose }: {
  icon: React.ReactNode; label: string; sub: string;
  href?: string | null; onClose?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const content = (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '8px 16px', cursor: 'pointer',
        backgroundColor: hovered ? 'var(--trella-surface-hover)' : 'transparent',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginTop: 2, color: 'var(--trella-text-subtle)' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--trella-text)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--trella-text-subtle)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} onClick={onClose} style={{ textDecoration: 'none', display: 'block' }}>{content}</Link>;
  }
  return content;
}

function NavDropItem({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return (
    <Link href={href} onClick={onClose} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{ padding: '8px 16px', fontSize: 14, color: 'var(--trella-text)', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--trella-surface-hover)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
      >
        {label}
      </div>
    </Link>
  );
}

function NavDropButton({ label, onClose, onClick }: { label: string; onClose: () => void; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      style={{ padding: '8px 16px', fontSize: 14, color: 'var(--trella-text)', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--trella-surface-hover)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
      onClick={() => { onClose(); onClick(); }}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      {label}
    </div>
  );
}
