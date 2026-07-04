import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { WorkspaceHeader } from "./_components/workspace-header";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getWorkspaceMode(workspaceId: string): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const token = cookies().get("access_token")?.value;
    const resp = await fetch(`${BACKEND}/api/v1/workspaces/${workspaceId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data?.mode as string) ?? null;
  } catch {
    return null;
  }
}

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: { workspaceId: string };
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { workspaceId } = params;
  const mode = await getWorkspaceMode(workspaceId);

  if (mode === "SCRUM") {
    const headersList = headers();
    const pathname = headersList.get("x-pathname") ?? "";
    const isRoot = pathname === `/workspaces/${workspaceId}`;
    const isBoardsIndex = pathname === `/workspaces/${workspaceId}/boards`;
    if (isRoot || isBoardsIndex) {
      notFound();
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <WorkspaceHeader workspaceId={workspaceId} />
      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
    </div>
  );
}
