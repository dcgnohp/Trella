import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { BoardsService, type BoardPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";
import { Info } from "../_components/info";
import { BoardList } from "../_components/board-list";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface OrganizationBoardsPageProps {
  params: { organizationId: string };
}

const OrganizationBoardsPage = async ({ params }: OrganizationBoardsPageProps) => {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const orgId = params.organizationId;

  // Check workspace mode — scrum orgs don't have a boards listing page
  let mode: string | null = null;
  try {
    const token = cookies().get("access_token")?.value;
    const resp = await fetch(`${BACKEND}/api/v1/workspaces/${orgId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (resp.ok) mode = ((await resp.json()) as { mode?: string }).mode ?? null;
  } catch { /* ignore */ }

  let boards: BoardPublic[];
  try {
    boards = await BoardsService.Boards_boardsListBoards({ orgId });
  } catch {
    boards = [];
  }

  // Scrum workspaces have exactly one board — go straight to it
  if (mode === "SCRUM") {
    if (boards.length > 0) redirect(`/workspaces/${orgId}/boards/${boards[0].id}`);
    redirect(`/workspaces/${orgId}/summary`);
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <Info isPro={false} />
      <div style={{ height: 1, backgroundColor: "var(--trella-border)", margin: "20px 0" }} />
      <BoardList boards={boards} isPro={false} />
    </div>
  );
};

export default OrganizationBoardsPage;
