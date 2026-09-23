import { PlansListClient } from './_components/plans-list-client';

interface PlansPageProps {
  params: { workspaceId: string };
}

export const metadata = { title: 'Plans' };

export default function PlansPage({ params }: PlansPageProps) {
  return <PlansListClient workspaceId={params.workspaceId} />;
}
