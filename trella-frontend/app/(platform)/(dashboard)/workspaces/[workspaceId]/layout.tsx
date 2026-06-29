import { WorkspaceHeader } from './_components/workspace-header';

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: { workspaceId: string };
}

export default function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <WorkspaceHeader workspaceId={params.workspaceId} />
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
    </div>
  );
}
