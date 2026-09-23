import { KanbanBoardScreen } from "./_components/kanban-board-screen";

export const metadata = {
  title: "Kanban Board",
};

interface BoardPageProps {
  params: {
    workspaceId: string;
    boardId: string;
  };
}

const BoardPage = ({ params }: BoardPageProps) => {
  return (
    <KanbanBoardScreen
      workspaceId={params.workspaceId}
      boardId={params.boardId}
    />
  );
};

export default BoardPage;
