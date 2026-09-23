"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

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
      // Non-fatal: cookie is a convenience pointer; route param is source of truth.
    });
  }, [organizationId]);

  return null;
};
