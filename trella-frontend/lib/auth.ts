import "server-only"

import { cookies } from "next/headers"

import {
  ApiError,
  LoginService,
  UsersService,
  type UserPublic,
} from "./client"
import { setAuthTokenProvider } from "./client-config"

/** Name of the httpOnly cookie holding the backend JWT. */
export const AUTH_COOKIE = "access_token"

/** Mirrors the backend ACCESS_TOKEN_EXPIRE_MINUTES (8 days). */
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 8

/** Cookie attributes shared between login (set) and signOut (clear). */
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

/** Returns undefined when there is no authenticated session. */
export function getAuthToken(): string | undefined {
  return cookies().get(AUTH_COOKIE)?.value
}

// Wire the cookie reader into the generated client so server-side requests attach the Bearer token.
setAuthTokenProvider(getAuthToken)

/** Returns null when unauthenticated (no token or 401). Other errors are propagated. */
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

/** Must be called from a Server Action or Route Handler. */
export function signOut(): void {
  cookies().delete(AUTH_COOKIE)
}

/** Exchange email + password for a JWT. Throws ApiError on invalid credentials. */
export async function login(email: string, password: string): Promise<string> {
  const { access_token } = await LoginService.Login_loginLoginAccessToken({
    formData: {
      username: email,
      password,
    },
  })
  return access_token
}

/** Register a new user. Throws ApiError (e.g. 409 "Email already registered") on failure. */
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
