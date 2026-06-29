import { redirect } from "next/navigation";

import { BoardsService, type BoardPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";

import { Info } from "./_components/info";
import { BoardList } from "./_components/board-list";

interface OrganizationIdPageProps {
  params: { organizationId: string };
}

const OrganizationIdPage = async ({ params }: OrganizationIdPageProps) => {
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
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>
      <Info isPro={false} />
      <div style={{ height: 1, backgroundColor: '#DFE1E6', margin: '20px 0' }} />
      <BoardList boards={boards} isPro={false} />
    </div>
  );
};

export default OrganizationIdPage;
