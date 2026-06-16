import "server-only"

import { cookies } from "next/headers"

import {
  ApiError,
  LoginService,
  UsersService,
  type UserPublic,
} from "./client"
import { setAuthTokenProvider } from "./client-config"

/**
 * Server-side auth helpers (Requirements 13.5, 13.6).
 *
 * The JWT issued by the backend (`POST /api/v1/login/access-token`) is stored
 * in an **httpOnly cookie** so it is never exposed to client JavaScript. These
 * helpers run on the server only:
 *
 *  - `getAuthToken()` reads the raw JWT from the cookie.
 *  - `getCurrentUser()` resolves the current user via `GET /api/v1/users/me`.
 *  - `signOut()` clears the cookie.
 *
 * The cookie itself is *set* by a Route Handler (`app/api/auth/login/route.ts`)
 * because httpOnly cookies cannot be written from client JS.
 *
 * This module also wires `getAuthToken` into the generated API client (via
 * `setAuthTokenProvider`) so every server-side request automatically carries
 * the `Authorization: Bearer <token>` header.
 */

/** Name of the httpOnly cookie holding the backend JWT. */
export const AUTH_COOKIE = "access_token"

/**
 * Lifetime of the auth cookie in seconds. Mirrors the backend
 * `ACCESS_TOKEN_EXPIRE_MINUTES` (8 days) so the cookie expires alongside the JWT.
 */
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 8

/**
 * Cookie attributes shared between the login Route Handler (which sets the
 * cookie) and `signOut` (which clears it), per Requirement 13.5:
 *  - `httpOnly`: never readable from client JS.
 *  - `sameSite: "lax"`: sent on top-level navigations, mitigates CSRF.
 *  - `secure`: only over HTTPS in production (allows plain HTTP in local dev).
 *  - `path: "/"`: available across the whole app.
 */
export function getAuthCookieOptions(): {
  httpOnly: boolean
  sameSite: "lax"
  secure: boolean
  path: string
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  }
}

/**
 * Read the raw JWT (no `Bearer ` prefix) from the httpOnly cookie.
 *
 * Returns `undefined` when there is no authenticated session. This is the
 * function wired into the generated client as the auth token provider.
 */
export function getAuthToken(): string | undefined {
  return cookies().get(AUTH_COOKIE)?.value
}

// Wire the cookie reader into the generated client so server-side requests
// automatically attach the Bearer token (Requirement 13.6 / design "API Client").
setAuthTokenProvider(getAuthToken)

/**
 * Resolve the currently authenticated user by calling `GET /api/v1/users/me`
 * with the cookie token. Returns `null` when:
 *  - there is no token, or
 *  - the backend rejects the token (HTTP 401).
 *
 * Other backend errors are propagated so callers can distinguish "not logged
 * in" from "backend is down".
 */
export async function getCurrentUser(): Promise<UserPublic | null> {
  const token = getAuthToken()
  if (!token) {
    return null
  }

  try {
    return await UsersService.Users_usersReadCurrentUser()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }
    throw error
  }
}

/**
 * Clear the auth cookie, ending the session.
 *
 * Must be invoked from a Server Action or Route Handler (the only contexts
 * where Next.js permits mutating cookies).
 */
export function signOut(): void {
  cookies().delete(AUTH_COOKIE)
}

/**
 * Convenience helper used by the login Route Handler: exchange email + password
 * for a JWT via the backend login endpoint. Returns the raw access token.
 *
 * Throws `ApiError` (e.g. 401) when credentials are invalid.
 */
export async function login(email: string, password: string): Promise<string> {
  const { access_token } = await LoginService.Login_loginLoginAccessToken({
    formData: {
      username: email,
      password,
    },
  })
  return access_token
}

/**
 * Convenience helper used by the signup Route Handler: register a new user via
 * `POST /api/v1/users/signup` (no auth required) and return the created user.
 *
 * Runs server-side so the request goes through the generated client (which has
 * its base URL configured here) rather than a direct browser call to the
 * backend. Throws `ApiError` (e.g. 409 "Email already registered") on failure.
 */
export async function signUp(
  email: string,
  password: string,
  fullName?: string | null,
): Promise<UserPublic> {
  return await UsersService.Users_usersSignup({
    requestBody: {
      email,
      password,
      full_name: fullName ?? null,
    },
  })
}
