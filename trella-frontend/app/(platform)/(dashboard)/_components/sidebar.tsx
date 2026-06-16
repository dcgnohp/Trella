"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useLocalStorage } from "usehooks-ts";

import type { OrganizationPublic } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion } from "@/components/ui/accordion";

import { NavItem, Organization } from "./nav-item";

interface SidebarProps {
  storageKey?: string;
};

export const Sidebar = ({
  storageKey = "t-sidebar-state",
}: SidebarProps) => {
  const [expanded, setExpanded] = useLocalStorage<Record<string, any>>(
    storageKey,
    {}
  );

  // API-backed organization state (Requirement 15.3, 15.4): the org list +
  // active org come from `GET /api/org`, which reads the httpOnly auth cookie
  // server-side and proxies `GET /organizations`.
  const [organizations, setOrganizations] = useState<OrganizationPublic[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/org", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { organizations: [], currentOrgId: null }))
      .then((data: { organizations?: OrganizationPublic[]; currentOrgId?: string | null }) => {
        if (!active) return;
        setOrganizations(data.organizations ?? []);
        setActiveOrgId(data.currentOrgId ?? null);
      })
      .catch(() => {
        if (active) {
          setOrganizations([]);
          setActiveOrgId(null);
        }
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const defaultAccordionValue: string[] = Object.keys(expanded)
    .reduce((acc: string[], key: string) => {
      if (expanded[key]) {
        acc.push(key);
      }

      return acc;
  }, []);

  const onExpand = (id: string) => {
    setExpanded((curr) => ({
      ...curr,
      [id]: !expanded[id],
    }));
  };

  if (!isLoaded) {
    return (
      <>
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-10 w-[50%]" />
          <Skeleton className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <NavItem.Skeleton />
          <NavItem.Skeleton />
          <NavItem.Skeleton />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="font-medium text-xs flex items-center mb-1">
        <span className="pl-4">
          Workspaces
        </span>
        <Button
          asChild
          type="button"
          size="icon"
          variant="ghost"
          className="ml-auto"
        >
          <Link href="/select-org">
            <Plus
              className="h-4 w-4"
            />
          </Link>
        </Button>
      </div>
      <Accordion
        type="multiple"
        defaultValue={defaultAccordionValue}
        className="space-y-2"
      >
        {organizations.map((organization) => (
          <NavItem
            key={organization.id}
            isActive={activeOrgId === organization.id}
            isExpanded={expanded[organization.id]}
            organization={organization as Organization}
            onExpand={onExpand}
          />
        ))}
      </Accordion>
    </>
  );
};
