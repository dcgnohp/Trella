import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth";

import { Info } from "../_components/info";

import { ActivityList } from "./_components/activity-list";

interface ActivityPageProps {
  params: {
    organizationId: string;
  };
}

/**
 * Activity page (Req 8.3, 10.2, 13.6).
 *
 * Removes `checkSubscription()` (Phase 1 has no Pro tier — Req 10.2) and the
 * `is_pro` flag is hard-coded to `false`. Auth is enforced via
 * `getCurrentUser()`; audit-log fetching lives in `<ActivityList />`.
 */
const ActivityPage = async ({ params }: ActivityPageProps) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const isPro = false;

  return (
    <div className="w-full">
      <Info isPro={isPro} />
      <Separator className="my-2" />
      <Suspense fallback={<ActivityList.Skeleton />}>
        <ActivityList orgId={params.organizationId} />
      </Suspense>
    </div>
  );
};

export default ActivityPage;
