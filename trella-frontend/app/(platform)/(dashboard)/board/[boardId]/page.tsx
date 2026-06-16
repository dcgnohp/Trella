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

/**
 * Board page (Req 5.2, 13.6, 13.8).
 *
 * Replaces the Prisma `db.list.findMany` query with
 * `BoardsService.Boards_boardsGetBoard`, which returns the nested
 * `BoardDetail` payload — board + lists (sorted ascending by `order`), each
 * carrying its `cards` (also sorted ascending by `order`). The backend enforces
 * org-membership via the JWT (404/403 when the caller isn't a member of the
 * board's organization, Req 4.1, 5.2).
 *
 * The `cards` field is optional on the generated `ListWithCards` schema, but
 * the backend always emits an array (possibly empty); we coerce it to `[]` so
 * the drag-and-drop reducer in `ListContainer` can iterate without null
 * checks.
 */
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
