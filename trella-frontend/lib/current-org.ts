import "server-only"

import { cookies } from "next/headers"

/**
 * Current-organization context helper (Requirement 15.2, 15.4).
 *
 * Every Board / List / Card / Audit-Log request must be scoped to the
 * organization the user is currently working in. The active organization is
 * fundamentally encoded in the URL (`/organization/[organizationId]`), but
 * Server Actions for Board/List/Card (task 22.2) do not always receive that
 * route param, so we also persist the active org id in a small cookie.
 *
 * ── Org-id mechanism (consumed by task 22.2) ────────────────────────────────
 *   - Cookie name: `org_id` (see `CURRENT_ORG_COOKIE`).
 *   - Server-side read:  `getCurrentOrgId(): string | undefined`.
 *   - Server-side write:  `setCurrentOrgId(orgId)` (Server Action / Route Handler only).
 *   - Server-side clear:  `clearCurrentOrgId()`.
 *
 * The cookie is intentionally **not** httpOnly: it carries no secret (just the
 * org UUID, already visible in the URL) and may be read by client code if
 * needed. Authorization is still enforced by the backend on every request
 * (membership check → HTTP 403), so the cookie value is only a convenience
 * pointer, never a trust boundary.
 *
 * Task 22.2 server actions should resolve the active org id with this priority:
 *   1. An explicit `orgId` argument passed into the action (e.g. from a form /
 *      route param) when available.
 *   2. Otherwise fall back to `getCurrentOrgId()` from this cookie.
 */

/** Name of the cookie holding the active organization id. */
export const CURRENT_ORG_COOKIE = "org_id"

/**
 * Lifetime of the org cookie in seconds (30 days). The cookie is a convenience
 * pointer, so a generous lifetime is fine; switching orgs overwrites it.
 */
export const CURRENT_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

/**
 * Cookie attributes shared between the writer (Route Handler / Server Action)
 * and the clearer. Not httpOnly (no secret), `SameSite=Lax`, `Secure` in prod.
 */
export function getCurrentOrgCookieOptions(): {
  httpOnly: boolean
  sameSite: "lax"
  secure: boolean
  path: string
} {
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  }
}

/**
 * Read the active organization id from the cookie, or `undefined` when no
 * organization has been selected yet.
 */
export function getCurrentOrgId(): string | undefined {
  return cookies().get(CURRENT_ORG_COOKIE)?.value || undefined
}

/**
 * Persist the active organization id. Must be called from a Server Action or
 * Route Handler (the only contexts where Next.js permits mutating cookies).
 */
export function setCurrentOrgId(orgId: string): void {
  cookies().set(CURRENT_ORG_COOKIE, orgId, {
    ...getCurrentOrgCookieOptions(),
    maxAge: CURRENT_ORG_COOKIE_MAX_AGE,
  })
}

/** Clear the active organization id (e.g. on sign-out). */
export function clearCurrentOrgId(): void {
  cookies().delete(CURRENT_ORG_COOKIE)
}
