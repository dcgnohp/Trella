import { Suspense } from "react";
import { ReportsPageClient } from "./_components/reports-page-client";

export default function ReportsPage({ params }: { params: { workspaceId: string } }) {
  return (
    <Suspense>
      <ReportsPageClient workspaceId={params.workspaceId} />
    </Suspense>
  );
}
