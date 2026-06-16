import { Plus } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { FormPopover } from "@/components/form/form-popover";
import { OrganizationsService, type OrganizationPublic } from "@/lib/client";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/current-org";

import { MobileSidebar } from "./mobile-sidebar";
import { OrgSwitcher } from "./org-switcher";

/**
 * Dashboard navbar (Requirements 15.3, 15.4).
 *
 * Server component: resolves the current user and their organizations
 * (`GET /organizations`) plus the active org id (cookie) on the server, then
 * renders the shadcn-based <OrgSwitcher /> (replacing the Clerk
 * `<OrganizationSwitcher />`).
 */
export const Navbar = async () => {
  const user = await getCurrentUser();

  let organizations: OrganizationPublic[] = [];
  if (user) {
    try {
      organizations =
        await OrganizationsService.Organizations_organizationsListOrganizations();
    } catch {
      organizations = [];
    }
  }

  const activeOrgId = getCurrentOrgId() ?? null;

  return (
    <nav className="fixed z-50 top-0 px-4 w-full h-14 border-b shadow-sm bg-white flex items-center">
      <MobileSidebar />
      <div className="flex items-center gap-x-4">
        <div className="hidden md:flex">
          <Logo />
        </div>
        <FormPopover align="start" side="bottom" sideOffset={18}>
          <Button variant="primary" size="sm" className="rounded-sm hidden md:block h-auto  py-1.5 px-2">
            Create
          </Button>
        </FormPopover>
        <FormPopover>
          <Button variant="primary" size="sm" className="rounded-sm block md:hidden">
            <Plus className="h-4 w-4" />
          </Button>
        </FormPopover>
      </div>
      <div className="ml-auto flex items-center gap-x-2">
        <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
        {/* TODO(21.x): replace Clerk <UserButton /> with user menu backed by useAuth(). */}
      </div>
    </nav>
  );
};
