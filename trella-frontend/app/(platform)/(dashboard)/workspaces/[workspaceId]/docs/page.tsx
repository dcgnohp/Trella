import { Suspense } from "react";
import { KnowledgeCenterClient } from "./_components/knowledge-center-client";

export default function DocsPage({ params }: { params: { workspaceId: string } }) {
  return (
    <Suspense>
      <KnowledgeCenterClient workspaceId={params.workspaceId} />
    </Suspense>
  );
}
