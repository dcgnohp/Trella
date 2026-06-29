import { redirect } from "next/navigation";
import { BoardsService } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";

interface Props {
  params: { workspaceId: string };
}

const BoardsIndexPage = async ({ params }: Props) => {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  try {
    const boards = await BoardsService.Boards_boardsListBoards({ orgId: params.workspaceId });
    if (boards.length > 0) {
      redirect(`/workspaces/${params.workspaceId}/boards/${boards[0].id}`);
    }
  } catch {
    // fall through to org page
  }

  redirect(`/organization/${params.workspaceId}`);
};

export default BoardsIndexPage;
