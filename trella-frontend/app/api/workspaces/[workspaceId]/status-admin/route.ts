import { NextResponse } from "next/server"

import {
  ApiError,
  CanonicalStatusesService,
  CustomStatusesService,
  WorkspaceMembersService,
  type CustomStatusPublic,
  type MappingSummary,
} from "@/lib/client"
import { getCurrentUser } from "@/lib/auth"

/**
 * Data + guard endpoint backing the Status-mapping admin screen (Req 11,
 * design §8.5.8A).
 *
 * Client components cannot call the generated client directly with the httpOnly
 * auth cookie, so the page goes through this server-side handler (same pattern
 * as `app/api/org/route.ts`). It returns everything the screen needs for its
 * initial render in one round-trip:
 *
 *   { canManage, statuses, summary, canonicalStatuses }
 *
 * `canManage` powers the ADMIN/OWNER-only guard (Req 11.1, 11.2). We determine
 * management permission by fetching workspace members and checking if the
 * current user has the ADMIN or OWNER role.
 */

const CANONICAL_FALLBACK = ["TODO", "IN_PROGRESS", "PENDING", "DONE"]

async function determineCanManage(workspaceId: string, currentUserId: string): Promise<boolean> {
  try {
    const members = await WorkspaceMembersService.WorkspaceMembers_workspaceMembersListMembers({
      workspaceId,
    })
    const me = members.find((m) => m.userId === currentUserId)
    if (!me || me.status !== "ACTIVE") {
      return false
    }
    return me.role === "ADMIN" || me.role === "OWNER"
  } catch {
    return false
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { workspaceId: string } },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { workspaceId } = params

  // Check permission separately so a failing data call doesn't mask the real role.
  const canManage = await determineCanManage(workspaceId, user.id)

  let statuses: CustomStatusPublic[] = []
  let summary: MappingSummary = { total: 0, mapped: 0, unmapped: 0, byCanonical: {} }
  let canonicalStatuses: string[] = CANONICAL_FALLBACK

  try {
    const [s, m, c] = await Promise.all([
      CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({
        workspaceId,
      }) as Promise<CustomStatusPublic[]>,
      CustomStatusesService.CustomStatuses_customStatusesGetMappingSummary({
        workspaceId,
      }) as Promise<MappingSummary>,
      CanonicalStatusesService.CanonicalStatuses_canonicalStatusesListCanonicalStatuses() as Promise<string[]>,
    ])
    statuses = s
    summary = m
    if (Array.isArray(c) && c.length > 0) canonicalStatuses = c
  } catch (error) {
    // Data fetch failed — still return canManage so the UI can show an empty state.
    if (error instanceof ApiError && error.status === 403) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 })
    }
  }

  return NextResponse.json({ canManage, statuses, summary, canonicalStatuses })
}
