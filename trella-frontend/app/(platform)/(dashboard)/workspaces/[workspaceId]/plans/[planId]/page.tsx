import { redirect } from 'next/navigation';

interface PlanIndexPageProps {
  params: { workspaceId: string; planId: string };
}

export default function PlanIndexPage({ params }: PlanIndexPageProps) {
  redirect(`/workspaces/${params.workspaceId}/plans/${params.planId}/summary`);
}
