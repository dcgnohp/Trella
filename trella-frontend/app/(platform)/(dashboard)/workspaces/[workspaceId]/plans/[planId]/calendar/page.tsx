import { PlanCalendarClient } from './_components/plan-calendar-client';

interface PlanCalendarPageProps {
  params: { workspaceId: string; planId: string };
}

export const metadata = { title: 'Plan Calendar' };

export default function PlanCalendarPage({ params }: PlanCalendarPageProps) {
  return <PlanCalendarClient planId={params.planId} workspaceId={params.workspaceId} />;
}
