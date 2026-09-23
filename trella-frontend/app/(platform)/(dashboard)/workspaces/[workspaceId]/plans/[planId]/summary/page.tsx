import { PlanSummaryClient } from './_components/plan-summary-client';

interface PlanSummaryPageProps {
  params: { workspaceId: string; planId: string };
}

export const metadata = { title: 'Plan Summary' };

export default function PlanSummaryPage({ params }: PlanSummaryPageProps) {
  return <PlanSummaryClient planId={params.planId} workspaceId={params.workspaceId} />;
}
