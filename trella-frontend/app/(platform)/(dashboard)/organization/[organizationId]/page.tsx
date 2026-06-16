import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { BoardsService, type BoardPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";

import { Info } from "./_components/info";
import { BoardList } from "./_components/board-list";

interface OrganizationIdPageProps {
  params: {
    organizationId: string;
  };
}

/**
 * Organization landing page (Req 5.2, 10.2, 13.6, 15.4).
 *
 * Replaces the Prisma `db.board.findMany` + `checkSubscription()` flow with:
 *  - `getCurrentUser()` for auth (redirect to `/sign-in` when unauthenticated),
 *  - `BoardsService.Boards_boardsListBoards({ orgId })` to fetch the boards
 *    visible to the current user inside the active organization. The backend
 *    enforces membership via the JWT (HTTP 403 when the caller isn't a member
 *    of the requested org, Req 4.1).
 *  - `isPro = false`. Phase 1 has no Stripe / billing wiring (Req 10.2 —
 *    `is_pro` always returns false), so the legacy `checkSubscription()` call
 *    is gone and we hard-code the free-tier UI.
 *
 * The page does the data fetching and passes the result to `BoardList` as a
 * prop — leaving `BoardList` purely presentational (PART 2 will polish its
 * styling further).
 */
const OrganizationIdPage = async ({ params }: OrganizationIdPageProps) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const orgId = params.organizationId;
  const isPro = false; // Req 10.2: Phase 1 has no Pro subscriptions.

  let boards: BoardPublic[];
  try {
    boards = await BoardsService.Boards_boardsListBoards({ orgId });
  } catch {
    // On any backend error (e.g. user not a member, network), render an empty
    // board list rather than crashing the page; the user can still create a
    // new org via the sidebar.
    boards = [];
  }

  return (
    <div className="w-full mb-20">
      <Info isPro={isPro} />
      <Separator className="my-4" />
      <div className="px-2 md:px-4">
        <Suspense fallback={<BoardList.Skeleton />}>
          <BoardList boards={boards} isPro={isPro} />
        </Suspense>
      </div>
    </div>
  );
};

export default OrganizationIdPage;
