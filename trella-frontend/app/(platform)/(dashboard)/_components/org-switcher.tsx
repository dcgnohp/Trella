"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { toast } from "sonner"

import type { OrganizationPublic } from "@/lib/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Organization picker (Requirements 15.3, 15.4).
 *
 * Replaces the Clerk `<OrganizationSwitcher />`. Lists the orgs the user
 * belongs to (fetched server-side and passed in as props) and lets them switch
 * the active organization. Selecting an org:
 *  1. POSTs to `/api/org` to persist the active org id (`org_id` cookie), and
 *  2. navigates to that org's dashboard (`/organization/{id}`).
 *
 * "Create organization" routes to `/select-org` (the create-org flow).
 */

interface OrgSwitcherProps {
  organizations: OrganizationPublic[]
  activeOrgId: string | null
}

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export const OrgSwitcher = ({ organizations, activeOrgId }: OrgSwitcherProps) => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const activeOrg =
    organizations.find((org) => org.id === activeOrgId) ?? organizations[0] ?? null

  const onSelect = (orgId: string) => {
    setOpen(false)
    if (orgId === activeOrg?.id) {
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId }),
        })
        if (!res.ok) {
          toast.error("Could not switch organization.")
          return
        }
        router.push(`/organization/${orgId}`)
        router.refresh()
      } catch {
        toast.error("Could not switch organization.")
      }
    })
  }

  if (organizations.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-auto py-1.5"
        onClick={() => router.push("/select-org")}
      >
        <Plus className="h-4 w-4 mr-2" />
        Create organization
      </Button>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto py-1.5 gap-x-2 max-w-[220px]"
          disabled={isPending}
        >
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs bg-sky-100 text-sky-700">
              {activeOrg ? orgInitials(activeOrg.name) : "?"}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-medium">
            {activeOrg?.name ?? "Select organization"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => onSelect(org.id)}
            className="gap-x-2"
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-sky-100 text-sky-700">
                {orgInitials(org.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate flex-1">{org.name}</span>
            <Check
              className={cn(
                "h-4 w-4",
                org.id === activeOrg?.id ? "opacity-100" : "opacity-0",
              )}
            />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/select-org")} className="gap-x-2">
          <Plus className="h-4 w-4" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
