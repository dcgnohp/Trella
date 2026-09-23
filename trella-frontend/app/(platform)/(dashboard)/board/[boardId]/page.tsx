import { notFound, redirect } from "next/navigation";

import { ApiError, BoardsService } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";
import type { ListWithCards } from "@/types";

import { ListContainer } from "./_components/list-container";

interface BoardIdPageProps {
  params: {
    boardId: string;
  };
}

const BoardIdPage = async ({ params }: BoardIdPageProps) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  let board;
  try {
    board = await BoardsService.Boards_boardsGetBoard({
      boardId: params.boardId,
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }

  const lists: ListWithCards[] = (board.lists ?? []).map((list) => ({
    ...list,
    cards: (list.cards ?? []).map((card) => ({
      ...card,
      description: card.description ?? null,
    })),
  }));

  return (
    <div className="p-4 h-full overflow-x-auto">
      <ListContainer
        boardId={params.boardId}
        data={lists}
      />
    </div>
  );
};

export default BoardIdPage;
