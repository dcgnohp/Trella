import { NextResponse } from "next/server"

import {
  ApiError,
  CustomStatusesService,
  type CanonicalStatus,
} from "@/lib/client"
import { getCurrentUser } from "@/lib/auth"

/**
 * Create a CustomStatus for a workspace (Req 8.2, 11.9).
 *
 * Server-side proxy for the "+ Add Custom Status" dialog. Reads the httpOnly
 * auth cookie (via the generated client wired in `lib/auth.ts`) and forwards to
 * `POST /api/v1/workspaces/{workspace_id}/custom-statuses`. Backend RBAC
 * (WorkspaceRole ADMIN/OWNER) and field validation are the real authority; this
 * handler surfaces the backend error message on failure.
 */
export async function POST(
  req: Request,
  { params }: { params: { workspaceId: string } },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: {
    name?: unknown
    color?: unknown
    canonicalStatus?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const color =
    typeof body.color === "string" && body.color.trim().length > 0
      ? body.color.trim()
      : null
  const canonicalStatus =
    typeof body.canonicalStatus === "string"
      ? (body.canonicalStatus as CanonicalStatus)
      : null

  try {
    const created =
      await CustomStatusesService.CustomStatuses_customStatusesCreateCustomStatus(
        {
          workspaceId: params.workspaceId,
          requestBody: { name: body.name.trim(), color, canonicalStatus },
        },
      )
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof ApiError) {
      const message =
        (error.body as { detail?: string } | undefined)?.detail ??
        "Failed to create custom status"
      return NextResponse.json(
        { error: message },
        { status: error.status || 502 },
      )
    }
    throw error
  }
}
