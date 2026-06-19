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

  try {
    const [statuses, summary, canonicalStatuses, canManage] =
      await Promise.all([
        CustomStatusesService.CustomStatuses_customStatusesListCustomStatuses({
          workspaceId,
        }) as Promise<CustomStatusPublic[]>,
        CustomStatusesService.CustomStatuses_customStatusesGetMappingSummary({
          workspaceId,
        }) as Promise<MappingSummary>,
        CanonicalStatusesService.CanonicalStatuses_canonicalStatusesListCanonicalStatuses() as Promise<
          string[]
        >,
        determineCanManage(workspaceId, user.id),
      ])

    return NextResponse.json({
      canManage,
      statuses,
      summary,
      canonicalStatuses:
        Array.isArray(canonicalStatuses) && canonicalStatuses.length > 0
          ? canonicalStatuses
          : CANONICAL_FALLBACK,
    })
  } catch (error) {
    // A 403 on the member-level list/summary means the caller is not an active
    // member of this workspace at all → definitely cannot manage statuses.
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return NextResponse.json(
        {
          canManage: false,
          statuses: [],
          summary: { total: 0, mapped: 0, unmapped: 0, byCanonical: {} },
          canonicalStatuses: CANONICAL_FALLBACK,
        },
        { status: 200 },
      )
    }
    return NextResponse.json(
      { error: "Failed to load custom statuses" },
      { status: 502 },
    )
  }
}
