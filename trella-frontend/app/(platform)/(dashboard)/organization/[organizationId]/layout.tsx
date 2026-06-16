import { startCase } from "lodash";

import { OrganizationsService } from "@/lib/client";

import { OrgControl } from "./_components/org-control";

export async function generateMetadata({
  params,
}: {
  params: { organizationId: string };
}) {
  // Resolve the active organization name via the organizations API
  // (Requirement 15.4). Falls back to a generic title on any error.
  let name = "organization";
  try {
    const org = await OrganizationsService.Organizations_organizationsGetOrganization({
      orgId: params.organizationId,
    });
    name = org.name;
  } catch {
    // ignore — use fallback title
  }

  return {
    title: startCase(name),
  };
};

const OrganizationIdLayout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  return (
    <>
      <OrgControl />
      {children}
    </>
  );
};

export default OrganizationIdLayout;
