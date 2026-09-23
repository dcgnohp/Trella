import { PlanProgramClient } from './_components/plan-program-client';

interface PlanProgramPageProps {
  params: { workspaceId: string; planId: string };
}

export const metadata = { title: 'Plan Program' };

export default function PlanProgramPage({ params }: PlanProgramPageProps) {
  return <PlanProgramClient planId={params.planId} workspaceId={params.workspaceId} />;
}
