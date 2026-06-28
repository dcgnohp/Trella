import { notFound, redirect } from "next/navigation";

import { ApiError, BoardsService, type BoardPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";

import { BoardNavbar } from "./_components/board-navbar";


async function loadBoard(boardId: string): Promise<BoardPublic | null> {
  try {
    return await BoardsService.Boards_boardsGetBoard({ boardId });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { boardId: string };
}) {
  const user = await getCurrentUser();
  if (!user) {
    return { title: "Board" };
  }

  const board = await loadBoard(params.boardId);
  return {
    title: board?.title || "Board",
  };
}

const BoardIdLayout = async ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { boardId: string };
}) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const board = await loadBoard(params.boardId);
  if (!board) {
    notFound();
  }

  const backgroundImage = board.imageFullUrl
    ? `url(${board.imageFullUrl})`
    : undefined;

  return (
    <div
      className="relative h-full bg-no-repeat bg-cover bg-center"
      style={{ backgroundImage }}
    >
      <BoardNavbar data={board} />
      <div className="absolute inset-0 bg-black/10" />
      <main className="relative pt-14 h-full">
        {children}
      </main>
    </div>
  );
};

export default BoardIdLayout;
