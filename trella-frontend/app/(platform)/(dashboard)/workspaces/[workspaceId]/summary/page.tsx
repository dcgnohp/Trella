import { SummaryPageClient } from './_components/summary-page-client';

interface SummaryPageProps {
  params: { workspaceId: string };
}

export const metadata = { title: 'Summary' };

export default function SummaryPage({ params }: SummaryPageProps) {
  return <SummaryPageClient workspaceId={params.workspaceId} />;
}
