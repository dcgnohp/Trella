import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { ApiError, OrganizationsService, type OrganizationPublic } from "@/lib/client"
import { getCurrentUser } from "@/lib/auth"
import {
  CURRENT_ORG_COOKIE,
  CURRENT_ORG_COOKIE_MAX_AGE,
  getCurrentOrgCookieOptions,
  getCurrentOrgId,
} from "@/lib/current-org"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { organizations: [], currentOrgId: null, error: "Not authenticated" },
      { status: 401 },
    )
  }

  try {
    const organizations: OrganizationPublic[] =
      await OrganizationsService.Organizations_organizationsListOrganizations()
    return NextResponse.json({
      organizations,
      currentOrgId: getCurrentOrgId() ?? null,
    })
  } catch {
    return NextResponse.json(
      { organizations: [], currentOrgId: null, error: "Failed to load organizations" },
      { status: 502 },
    )
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let orgId: unknown
  try {
    const body = await req.json()
    orgId = body?.orgId
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof orgId !== "string" || !orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 })
  }

  // Backend returns 403/404 if user is not a member or org does not exist.
  try {
    await OrganizationsService.Organizations_organizationsGetOrganization({ orgId })
  } catch (error) {
    if (error instanceof ApiError) {
      const status = error.status === 403 || error.status === 404 ? 403 : error.status || 502
      return NextResponse.json(
        { error: "You do not have access to that organization." },
        { status },
      )
    }
    throw error
  }

  cookies().set(CURRENT_ORG_COOKIE, orgId, {
    ...getCurrentOrgCookieOptions(),
    maxAge: CURRENT_ORG_COOKIE_MAX_AGE,
  })

  return NextResponse.json({ success: true })
}
