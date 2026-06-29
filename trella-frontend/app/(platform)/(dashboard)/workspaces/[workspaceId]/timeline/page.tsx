import { TimelinePageClient } from './_components/timeline-page-client';

interface TimelinePageProps {
  params: { workspaceId: string };
}

export const metadata = { title: 'Timeline' };

export default function TimelinePage({ params }: TimelinePageProps) {
  return <TimelinePageClient workspaceId={params.workspaceId} />;
}
