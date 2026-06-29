'use client';

import React, { createContext, useContext, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppNavbar } from './app-navbar';
import { AppSidebar } from './app-sidebar';

export const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});
export const useSidebar = () => useContext(SidebarContext);

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const workspaceId = (params?.workspaceId as string) ?? null;
  const [collapsed, setCollapsed] = useState(false);

  // ponytail: read projectType from localStorage — BE doesn't have it yet
  const projectType = React.useMemo(() => {
    if (!workspaceId || typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(`trella:projectType:${workspaceId}`);
    return (stored as 'kanban' | 'scrum' | null) ?? null;
  }, [workspaceId]);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed(v => !v) }}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#F4F5F7' }}>
        <AppNavbar />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <AppSidebar workspaceId={workspaceId} projectType={projectType} collapsed={collapsed} />
          <main style={{ flex: 1, overflow: 'auto', backgroundColor: '#F4F5F7' }}>{children}</main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
