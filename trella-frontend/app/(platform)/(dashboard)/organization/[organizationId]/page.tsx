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

const OrganizationIdPage = async ({ params }: OrganizationIdPageProps) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const orgId = params.organizationId;
  const isPro = false;

  let boards: BoardPublic[];
  try {
    boards = await BoardsService.Boards_boardsListBoards({ orgId });
  } catch {
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
