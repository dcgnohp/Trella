import { redirect } from "next/navigation";

import { OrganizationsService, type OrganizationPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/current-org";

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
