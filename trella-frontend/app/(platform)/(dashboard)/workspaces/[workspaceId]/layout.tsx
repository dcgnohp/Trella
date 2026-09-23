import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { WorkspaceHeader } from "./_components/workspace-header";
import { AiChatPanel } from "@/components/ai/ai-chat-panel";
import { WorkspaceAiContext } from "@/components/ai/workspace-ai-context";
import { ConversationContextProvider } from "@/lib/ai/conversation-context";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getWorkspaceInfo(workspaceId: string): Promise<{ mode: string | null; firstBoardId: string | null }> {
  try {
    const token = cookies().get("access_token")?.value;
    const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const [workspaceResp, boardsResp] = await Promise.all([
      fetch(`${BACKEND}/api/v1/workspaces/${workspaceId}`, { headers: authHeader, cache: "no-store" }),
      fetch(`${BACKEND}/api/v1/boards?orgId=${workspaceId}`, { headers: authHeader, cache: "no-store" }),
    ]);
    const mode = workspaceResp.ok ? (((await workspaceResp.json()) as { mode?: string }).mode ?? null) : null;
    let firstBoardId: string | null = null;
    if (boardsResp.ok) {
      const boards = (await boardsResp.json()) as Array<{ id: string }>;
      firstBoardId = boards[0]?.id ?? null;
    }
    return { mode, firstBoardId };
  } catch {
    return { mode: null, firstBoardId: null };
  }
}

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: { workspaceId: string };
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { workspaceId } = params;
  const { mode, firstBoardId } = await getWorkspaceInfo(workspaceId);
  const headersList = headers();
  const pathname = headersList.get("x-pathname") ?? "";

  // Scrum workspaces: /boards index → redirect to the single board
  if (mode === "SCRUM") {
    const isBoardsIndex =
      pathname === `/workspaces/${workspaceId}/boards` ||
      pathname === `/workspaces/${workspaceId}`;
    if (isBoardsIndex) {
      if (firstBoardId) redirect(`/workspaces/${workspaceId}/boards/${firstBoardId}`);
      redirect(`/workspaces/${workspaceId}/summary`);
    }
  }

  const isPlanRoute = pathname.includes(`/plans/`) && pathname.split(`/plans/`)[1]?.length > 0;

  return (
    <ConversationContextProvider>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!isPlanRoute && <WorkspaceHeader workspaceId={workspaceId} />}
        <div style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "row" }}>
          <div style={{ flex: 1, overflow: "auto", minWidth: 0, height: "100%" }}>
            {children}
          </div>
          <AiChatPanel />
        </div>
        <WorkspaceAiContext workspaceId={workspaceId} />
      </div>
    </ConversationContextProvider>
  );
}
