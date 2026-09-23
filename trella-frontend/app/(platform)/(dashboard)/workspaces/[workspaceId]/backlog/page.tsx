import { BacklogPageClient } from './_components/backlog-page-client';

interface BacklogPageProps {
  params: { workspaceId: string };
}

export const metadata = { title: 'Backlog' };

export default function BacklogPage({ params }: BacklogPageProps) {
  return <BacklogPageClient workspaceId={params.workspaceId} />;
}
