import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Route guard middleware (Requirement 13.8 / design "Thiết kế Frontend").
 *
 * Clerk's `authMiddleware` was removed in task 19.1. Auth is now backed by a
 * JWT stored in an **httpOnly cookie** (`access_token`, see `lib/auth.ts`).
 *
 * This middleware performs lightweight, edge-friendly gating based on the
 * *presence* of that cookie:
 *
 *  - Unauthenticated requests (no cookie) to a **protected** page route are
 *    redirected (HTTP 307) to `/sign-in?redirect=<original path>`.
 *  - Authenticated requests (cookie present) hitting `/sign-in` or `/sign-up`
 *    are redirected back to the app home (`/`).
 *  - Public routes, auth route handlers, the external webhook and Next.js
 *    internals are always allowed through.
 *
 * Note: the middleware only checks that the cookie exists — it cannot validate
 * the JWT against the backend cheaply from the edge runtime. Full validation
 * happens server-side via `lib/auth.ts getCurrentUser()` (which calls
 * `GET /api/v1/users/me`). Cookie-presence gating is the intended behaviour for
 * this guard per Requirement 13.8.
 */

/**
 * Name of the httpOnly cookie holding the backend JWT. Kept in sync with
 * `AUTH_COOKIE` in `lib/auth.ts`. It is duplicated here because `lib/auth.ts`
 * is a `server-only` module (it uses `next/headers`) and cannot be imported
 * into the edge middleware runtime.
 */
const AUTH_COOKIE = "access_token"

/** Where unauthenticated users are sent. */
const SIGN_IN_PATH = "/sign-in"

/** Where already-authenticated users are sent away from auth pages. */
const HOME_PATH = "/"

/**
 * Auth pages. An authenticated user landing here is bounced to the home page so
 * they don't see the sign-in / sign-up forms while already logged in.
 */
const AUTH_PAGES = ["/sign-in", "/sign-up"]

/**
 * Routes that must remain reachable without an auth cookie.
 *
 *  - `/`                marketing / landing page.
 *  - `/sign-in`         the sign-in page itself (avoids a redirect loop).
 *  - `/sign-up`         the sign-up page.
 *
 * Matched as an exact path OR as a path prefix (`<route>/...`).
 */
const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-up"]

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasToken = Boolean(request.cookies.get(AUTH_COOKIE)?.value)

  // API route handlers enforce their own auth (returning JSON 401) and the
  // external webhook + auth endpoints must stay reachable, so we never apply a
  // page redirect to `/api/*`. Redirecting an API/fetch call to the HTML
  // sign-in page would break the caller.
  if (pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  // Authenticated user on an auth page → send them into the app.
  if (hasToken && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL(HOME_PATH, request.url))
  }

  // Public pages are always allowed.
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  // Protected page without a cookie → bounce to sign-in, preserving the
  // originally requested path so the sign-in flow can return the user there.
  if (!hasToken) {
    const signInUrl = new URL(SIGN_IN_PATH, request.url)
    signInUrl.searchParams.set("redirect", pathname + request.nextUrl.search)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

/**
 * Run the middleware on every request except Next.js internals and static
 * assets. Standard Next 14 pattern: excludes `_next/static`, `_next/image`,
 * `favicon.ico` and common static file extensions so the guard only evaluates
 * real navigations and API calls.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|ttf|eot)$).*)",
  ],
}
