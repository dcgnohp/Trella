import "server-only"

import { cookies } from "next/headers"

/** Name of the cookie holding the active organization id. */
export const CURRENT_ORG_COOKIE = "org_id"

/** 30 days in seconds. */
export const CURRENT_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

// Not httpOnly — the org id is already visible in the URL and carries no secret.
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

/** Returns the active organization id from the cookie, or `undefined` if none. */
export function getCurrentOrgId(): string | undefined {
  return cookies().get(CURRENT_ORG_COOKIE)?.value || undefined
}

/** Persist the active organization id. Must be called from a Server Action or Route Handler. */
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
