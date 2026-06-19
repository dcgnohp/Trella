import { BoardMembersScreen } from "./_components/board-members-screen";

export const metadata = {
  title: "Board Members",
};

const BoardMembersPage = ({
  params,
}: {
  params: { projectId: string; boardId: string };
}) => {
  return (
    <BoardMembersScreen
      projectId={params.projectId}
      boardId={params.boardId}
    />
  );
};

export default BoardMembersPage;
