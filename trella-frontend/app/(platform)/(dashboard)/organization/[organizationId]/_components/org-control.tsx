"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

/**
 * Keeps the active organization (the `org_id` cookie) in sync with the URL
 * (Requirement 15.4).
 *
 * Whenever the user lands on `/organization/{organizationId}`, this posts the
 * route param to `/api/org`, which persists it as the active org so that
 * Board/List/Card/Audit-Log server actions (task 22.2) resolve the same org via
 * `getCurrentOrgId()` even when they don't receive the route param directly.
 */
export const OrgControl = () => {
  const params = useParams();
  const organizationId = params.organizationId as string | undefined;

  useEffect(() => {
    if (!organizationId) return;

    fetch("/api/org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: organizationId }),
    }).catch(() => {
      // Non-fatal: the route param remains the source of truth for the page;
      // the cookie is only a convenience pointer for server actions.
    });
  }, [organizationId]);

  return null;
};
