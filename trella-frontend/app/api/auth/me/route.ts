import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"

/**
 * Current-user Route Handler (Requirement 13.6).
 *
 * The auth JWT lives in an httpOnly cookie that is *not* readable from client
 * JavaScript, so the `useAuth()` hook cannot call `GET /api/v1/users/me`
 * directly. Instead it fetches this handler, which reads the cookie on the
 * server (via `lib/auth.ts`) and resolves the current user.
 *
 * Responses:
 *  - 200 `{ user: UserPublic }` when authenticated.
 *  - 200 `{ user: null }` when there is no session (no cookie / token rejected).
 *  - 502 `{ error }` when the backend is unreachable.
 *
 * We deliberately return 200 with `user: null` (rather than 401) for the
 * "not logged in" case so the client hook can treat it as a normal, expected
 * state without console noise.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    return NextResponse.json({ user })
  } catch {
    return NextResponse.json(
      { user: null, error: "Failed to resolve current user" },
      { status: 502 },
    )
  }
}
