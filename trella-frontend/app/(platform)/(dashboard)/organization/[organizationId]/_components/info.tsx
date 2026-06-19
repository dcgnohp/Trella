"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CreditCard } from "lucide-react";

import type { OrganizationPublic } from "@/lib/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface InfoProps {
  isPro: boolean;
};

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const Info = ({
  isPro,
}: InfoProps) => {
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
        const found =
          data.organizations?.find((org) => org.id === organizationId) ?? null;
        setOrganization(found);
      })
      .catch(() => {
        if (active) setOrganization(null);
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  if (!isLoaded) {
    return (
      <Info.Skeleton />
    );
  }

  return (
    <div className="flex items-center gap-x-4">
      <Avatar className="w-[60px] h-[60px] rounded-md">
        <AvatarFallback className="rounded-md bg-sky-100 text-sky-700 text-lg font-semibold">
          {organization ? orgInitials(organization.name) : "?"}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <p className="font-semibold text-xl">
          {organization?.name ?? "Organization"}
        </p>
        <div className="flex items-center text-xs text-muted-foreground">
          <CreditCard className="h-3 w-3 mr-1" />
          {isPro ? "Pro" : "Free"}
        </div>
      </div>
    </div>
  );
};

Info.Skeleton = function SkeletonInfo() {
  return (
    <div className="flex items-center gap-x-4">
      <div className="w-[60px] h-[60px] relative">
        <Skeleton className="w-full h-full absolute" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-10 w-[200px]" />
        <div className="flex items-center">
          <Skeleton className="h-4 w-4 mr-2" />
          <Skeleton className="h-4 w-[100px]" />
        </div>
      </div>
    </div>
  );
};
