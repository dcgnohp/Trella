import { NextResponse } from "next/server"

import {
  ApiError,
  CustomStatusesService,
  type CanonicalStatus,
} from "@/lib/client"
import { getCurrentUser } from "@/lib/auth"

/**
 * Set or clear a CustomStatus' canonical mapping (Req 9.2, 9.3, 11.5).
 *
 * Server-side proxy for the optimistic "Mapped Canonical" dropdown. Forwards to
 * `PUT /api/v1/custom-statuses/{custom_status_id}/mapping`, sending
 * `canonicalStatus: null` when the admin picks "Unmapped". Backend RBAC
 * (WorkspaceRole ADMIN/OWNER) is the real authority; this handler surfaces the
 * backend error message so the client can roll back and toast (Req 11.6).
 */
export async function PUT(
  req: Request,
  { params }: { params: { customStatusId: string } },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: { canonicalStatus?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const canonicalStatus =
    typeof body.canonicalStatus === "string"
      ? (body.canonicalStatus as CanonicalStatus)
      : null

  try {
    const updated =
      await CustomStatusesService.CustomStatuses_customStatusesSetCustomStatusMapping(
        {
          customStatusId: params.customStatusId,
          requestBody: { canonicalStatus },
        },
      )
    return NextResponse.json(updated, { status: 200 })
  } catch (error) {
    if (error instanceof ApiError) {
      const message =
        (error.body as { detail?: string } | undefined)?.detail ??
        "Failed to update mapping"
      return NextResponse.json(
        { error: message },
        { status: error.status || 502 },
      )
    }
    throw error
  }
}
