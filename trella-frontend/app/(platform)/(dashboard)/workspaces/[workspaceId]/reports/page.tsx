import { Suspense } from "react";
import dynamic from "next/dynamic";

const ReportsPageClient = dynamic(
  () => import("./_components/reports-page-client").then(m => ({ default: m.ReportsPageClient })),
  { ssr: false }
);

export default function ReportsPage({ params }: { params: { workspaceId: string } }) {
  return (
    <Suspense>
      <ReportsPageClient workspaceId={params.workspaceId} />
    </Suspense>
  );
}
