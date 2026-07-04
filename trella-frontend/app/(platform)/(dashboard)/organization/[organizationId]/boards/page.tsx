import { redirect } from "next/navigation";
import { BoardsService, type BoardPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";
import { Info } from "../_components/info";
import { BoardList } from "../_components/board-list";

interface OrganizationBoardsPageProps {
  params: { organizationId: string };
}

const OrganizationBoardsPage = async ({ params }: OrganizationBoardsPageProps) => {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const orgId = params.organizationId;
  let boards: BoardPublic[];
  try {
    boards = await BoardsService.Boards_boardsListBoards({ orgId });
  } catch {
    boards = [];
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
