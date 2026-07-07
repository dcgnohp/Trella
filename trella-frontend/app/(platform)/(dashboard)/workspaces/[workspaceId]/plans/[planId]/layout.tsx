import { PlanTabBar } from './_components/plan-tab-bar';
import { PlanStagingProvider } from './_hooks/use-plan-staging';

interface PlanLayoutProps {
  children: React.ReactNode;
  params: { workspaceId: string; planId: string };
}

export default function PlanLayout({ children, params }: PlanLayoutProps) {
  const { workspaceId, planId } = params;
  return (
    <PlanStagingProvider planId={planId} workspaceId={workspaceId}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <PlanTabBar planId={planId} workspaceId={workspaceId} />
        <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
      </div>
    </PlanStagingProvider>
  );
}
