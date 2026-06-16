"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import type { OrganizationPublic } from "@/lib/client"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"

import { CreateOrganizationForm } from "./_components/create-organization-form"

/**
 * Organization picker + create-org flow (Requirements 15.1, 15.2, 15.3).
 *
 * Replaces the Clerk `<OrganizationList />`. Lists the orgs the user already
 * belongs to (select to switch + navigate) and always exposes the create-org
 * form. The `/organization` entry page redirects empty-org users here.
 */

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default function SelectOrganizationPage() {
  const router = useRouter()
  const [organizations, setOrganizations] = useState<OrganizationPublic[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch("/api/org", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { organizations: [] }))
      .then((data: { organizations?: OrganizationPublic[] }) => {
        if (active) setOrganizations(data.organizations ?? [])
      })
      .catch(() => {
        if (active) setOrganizations([])
      })
      .finally(() => {
        if (active) setIsLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const onSelect = async (orgId: string) => {
    setSwitchingId(orgId)
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      })
      if (!res.ok) {
        toast.error("Could not open that organization.")
        return
      }
      router.push(`/organization/${orgId}`)
      router.refresh()
    } catch {
      toast.error("Could not open that organization.")
    } finally {
      setSwitchingId(null)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Your organizations</CardTitle>
        <CardDescription>
          Select an organization to continue, or create a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoaded ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : organizations.length > 0 ? (
          <>
            <div className="space-y-2">
              {organizations.map((org) => (
                <Button
                  key={org.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-x-3 h-auto py-2"
                  disabled={switchingId !== null}
                  onClick={() => onSelect(org.id)}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-sky-100 text-sky-700">
                      {orgInitials(org.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{org.name}</span>
                  {switchingId === org.id && (
                    <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                  )}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-x-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or create new</span>
              <Separator className="flex-1" />
            </div>
          </>
        ) : null}
        <CreateOrganizationForm />
      </CardContent>
    </Card>
  )
}
