import { PlanTimelineClient } from './_components/plan-timeline-client';

interface PlanTimelinePageProps {
  params: { workspaceId: string; planId: string };
}

export const metadata = { title: 'Plan Timeline' };

export default function PlanTimelinePage({ params }: PlanTimelinePageProps) {
  return <PlanTimelineClient planId={params.planId} workspaceId={params.workspaceId} />;
}
