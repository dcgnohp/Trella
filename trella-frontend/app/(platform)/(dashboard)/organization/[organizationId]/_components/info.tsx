"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { OrganizationPublic } from "@/lib/client";

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const Info = ({ isPro }: { isPro: boolean }) => {
  const params = useParams();
  const organizationId = params.organizationId as string | undefined;
  const [organization, setOrganization] = useState<OrganizationPublic | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/org", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { organizations: [] }))
      .then((data: { organizations?: OrganizationPublic[] }) => {
        if (!active) return;
        setOrganization(data.organizations?.find((org) => org.id === organizationId) ?? null);
      })
      .catch(() => { if (active) setOrganization(null); })
      .finally(() => { if (active) setIsLoaded(true); });
    return () => { active = false; };
  }, [organizationId]);

  if (!isLoaded) return <Info.Skeleton />;

  const name = organization?.name ?? "Organization";
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 8, flexShrink: 0,
        background: 'linear-gradient(135deg,#0052CC,#6554C0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 700, color: '#fff',
      }}>
        {orgInitials(name)}
      </div>
      <div>
        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--trella-text)', margin: 0 }}>{name}</p>
        <p style={{ fontSize: 12, color: 'var(--trella-text-subtlest)', margin: '2px 0 0' }}>
          {isPro ? 'Pro' : 'Free'}
        </p>
      </div>
    </div>
  );
};

Info.Skeleton = function SkeletonInfo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: 'var(--trella-border)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ width: 160, height: 20, borderRadius: 4, backgroundColor: 'var(--trella-border)' }} />
        <div style={{ width: 60, height: 14, borderRadius: 4, backgroundColor: 'var(--trella-border)' }} />
      </div>
    </div>
  );
};
