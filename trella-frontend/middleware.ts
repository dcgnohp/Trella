import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Cookie name must stay in sync with AUTH_COOKIE in lib/auth.ts.
// Duplicated here because lib/auth.ts is server-only and cannot be imported in the edge runtime.
const AUTH_COOKIE = "access_token"

const SIGN_IN_PATH = "/sign-in"
const HOME_PATH = "/"

const AUTH_PAGES = ["/sign-in", "/sign-up"]

const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-up"]

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasToken = Boolean(request.cookies.get(AUTH_COOKIE)?.value)

  // Never redirect API routes — callers expect JSON, not an HTML sign-in page.
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

  // Pass pathname to server components via header for route guards
  const response = NextResponse.next()
  response.headers.set("x-pathname", pathname)
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|ttf|eot)$).*)",
  ],
}
