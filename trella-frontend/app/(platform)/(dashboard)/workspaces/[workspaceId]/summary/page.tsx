import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const SummaryPageClient = dynamic(
  () => import('./_components/summary-page-client').then(m => ({ default: m.SummaryPageClient })),
  { ssr: false }
);

interface SummaryPageProps {
  params: { workspaceId: string };
}

export const metadata = { title: 'Summary' };

export default function SummaryPage({ params }: SummaryPageProps) {
  return (
    <Suspense>
      <SummaryPageClient workspaceId={params.workspaceId} />
    </Suspense>
  );
}
