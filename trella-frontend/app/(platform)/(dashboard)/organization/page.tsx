import { redirect } from "next/navigation";

import { OrganizationsService, type OrganizationPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/current-org";

/**
 * Organization entry point (Requirement 15.1).
 *
 * Reached right after sign-in (`/sign-in` redirects here). Resolves the user's
 * organizations server-side and routes accordingly:
 *  - not authenticated      → `/sign-in`
 *  - no organizations        → `/select-org` (create-org flow, Req 15.1)
 *  - has organizations       → the active org from the `org_id` cookie when it
 *                              is still a member, otherwise the first org.
 */
const OrganizationEntryPage = async () => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  let organizations: OrganizationPublic[] = [];
  try {
    organizations =
      await OrganizationsService.Organizations_organizationsListOrganizations();
  } catch {
    organizations = [];
  }

  if (organizations.length === 0) {
    redirect("/select-org");
  }

  const currentOrgId = getCurrentOrgId();
  const activeOrg =
    organizations.find((org) => org.id === currentOrgId) ?? organizations[0];

  redirect(`/organization/${activeOrg.id}`);
};

export default OrganizationEntryPage;
