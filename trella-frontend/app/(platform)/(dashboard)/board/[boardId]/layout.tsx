import { notFound, redirect } from "next/navigation";

import { ApiError, BoardsService, type BoardPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";

import { BoardNavbar } from "./_components/board-navbar";

/**
 * Board layout (Req 5.2, 13.6, 13.8).
 *
 * Replaces the Prisma `db.board.findUnique` + Clerk `auth().orgId` flow with:
 *  - `getCurrentUser()` for auth (redirect to `/sign-in` when unauthenticated),
 *  - `BoardsService.Boards_boardsGetBoard` for board metadata; the backend
 *    enforces org-scoping via the JWT (404 when the board doesn't exist or the
 *    caller isn't a member of its organization — Req 4.1, 5.2).
 *
 * The generated client returns `BoardDetail` (board + nested lists), but the
 * layout only renders the board chrome (title + cover image), so we narrow the
 * payload to `BoardPublic` shape — the nested `lists` are loaded by the page
 * itself.
 */

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

  // `imageFullUrl` is nullable in `BoardPublic`; fall back to a transparent
  // background when the board has no cover image so we don't render
  // `url(null)`.
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
      <main className="relative pt-28 h-full">
        {children}
      </main>
    </div>
  );
};

export default BoardIdLayout;
