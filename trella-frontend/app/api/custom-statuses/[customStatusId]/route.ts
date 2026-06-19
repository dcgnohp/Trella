import { NextResponse } from "next/server"

import {
  ApiError,
  CustomStatusesService,
  type CanonicalStatus,
} from "@/lib/client"
import { getCurrentUser } from "@/lib/auth"

/**
 * Edit (PATCH) and delete (DELETE) a single CustomStatus (Req 8.7, 8.8, 8.9,
 * 11.3, 11.11).
 *
 * Server-side proxies for the admin screen's row actions. The DELETE handler
 * specially surfaces the backend's HTTP 409 "Cannot delete custom status: still
 * in use" together with the reference count so the client can show a warning
 * dialog and skip the deletion (Req 11.11).
 */

/** Best-effort extraction of the in-use reference count from a 409 body. */
function extractReferenceCount(body: unknown): number | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  // The backend may surface the count either at the top level or nested under
  // `detail` (FastAPI's default error envelope). Probe the common shapes.
  const candidates: unknown[] = [
    record.referenceCount,
    record.reference_count,
    record.count,
    (record.detail as Record<string, unknown> | undefined)?.referenceCount,
    (record.detail as Record<string, unknown> | undefined)?.reference_count,
    (record.detail as Record<string, unknown> | undefined)?.count,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate
    }
  }
  return null
}

function detailMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail
    if (typeof detail === "string") return detail
    if (detail && typeof detail === "object") {
      const message = (detail as { message?: unknown }).message
      if (typeof message === "string") return message
    }
  }
  return fallback
}

export async function PATCH(
  req: Request,
  { params }: { params: { customStatusId: string } },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: { name?: unknown; color?: unknown; canonicalStatus?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const requestBody: {
    name?: string
    color?: string | null
    canonicalStatus?: CanonicalStatus | null
  } = {}
  if (typeof body.name === "string") requestBody.name = body.name.trim()
  if (body.color === null) requestBody.color = null
  else if (typeof body.color === "string")
    requestBody.color = body.color.trim().length > 0 ? body.color.trim() : null
  if (body.canonicalStatus === null) requestBody.canonicalStatus = null
  else if (typeof body.canonicalStatus === "string")
    requestBody.canonicalStatus = body.canonicalStatus as CanonicalStatus

  try {
    const updated =
      await CustomStatusesService.CustomStatuses_customStatusesUpdateCustomStatus(
        {
          customStatusId: params.customStatusId,
          requestBody,
        },
      )
    return NextResponse.json(updated, { status: 200 })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: detailMessage(error.body, "Failed to update custom status") },
        { status: error.status || 502 },
      )
    }
    throw error
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { customStatusId: string } },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    await CustomStatusesService.CustomStatuses_customStatusesDeleteCustomStatus({
      customStatusId: params.customStatusId,
    })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof ApiError) {
      const message = detailMessage(
        error.body,
        "Failed to delete custom status",
      )
      if (error.status === 409) {
        return NextResponse.json(
          {
            error: message,
            inUse: true,
            referenceCount: extractReferenceCount(error.body),
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: message },
        { status: error.status || 502 },
      )
    }
    throw error
  }
}
