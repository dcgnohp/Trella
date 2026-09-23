import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { LAST_VISITED_COOKIE, lastVisitedHref } from "@/lib/last-visited";
import { LandingPageClient } from "./_components/landing-page-client";

const MarketingPage = async () => {
  const user = await getCurrentUser();
  const dashboardHref = lastVisitedHref(cookies().get(LAST_VISITED_COOKIE)?.value);

  return (
    <LandingPageClient
      isAuthenticated={!!user}
      dashboardHref={dashboardHref}
    />
  );
};

export default MarketingPage;
