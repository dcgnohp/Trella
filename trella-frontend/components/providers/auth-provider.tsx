"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import type { UserPublic } from "@/lib/client"

/**
 * Client-side auth context + `useAuth()` hook (Requirement 13.6).
 *
 * The backend JWT is stored in an **httpOnly cookie** which client JavaScript
 * cannot read. So this provider never touches the token directly. Instead it
 * talks to the Next.js Route Handlers added in task 21.1 / 21.2:
 *
 *  - `GET  /api/auth/me`     → resolve the current user (cookie read server-side)
 *  - `POST /api/auth/login`  → exchange credentials for a cookie
 *  - `POST /api/auth/signup` → register a new user
 *  - `POST /api/auth/logout` → clear the cookie
 *
 * IMPORTANT: this file must NOT import the server-only `lib/auth.ts` (it uses
 * `next/headers` + `server-only`). Only the Route Handlers do that.
 */

/** Shape returned by `useAuth()`. */
export interface AuthContextValue {
  /** The current user, or `null` when not authenticated / still loading. */
  user: UserPublic | null
  /** `true` while the initial session lookup is in flight. */
  isLoading: boolean
  /** Derived convenience flag: `true` when a user is resolved. */
  isAuthenticated: boolean
  /**
   * Sign in with email + password. On success the auth cookie is set and the
   * user state is refreshed. Throws an `Error` with a user-facing message
   * (e.g. "Incorrect email or password") on failure so callers can display it.
   */
  signIn: (email: string, password: string) => Promise<UserPublic>
  /**
   * Register a new account. When `autoSignIn` is `true` (default) the user is
   * signed in immediately afterwards. Throws an `Error` with a user-facing
   * message (e.g. "Email already registered") on failure.
   */
  signUp: (
    email: string,
    password: string,
    fullName?: string,
    options?: { autoSignIn?: boolean },
  ) => Promise<void>
  /** Sign out: clears the cookie and resets local user state. */
  signOut: () => Promise<void>
  /** Re-fetch the current user from the server (e.g. after external changes). */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Read a JSON error message from a failed Route Handler response, falling back
 * to a sensible default when the body is missing or malformed.
 */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    if (data && typeof data.error === "string") {
      return data.error
    }
  } catch {
    // ignore malformed body
  }
  return fallback
}

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [user, setUser] = useState<UserPublic | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  /** Fetch the current user from `/api/auth/me`. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      })
      if (!res.ok) {
        setUser(null)
        return
      }
      const data = (await res.json()) as { user: UserPublic | null }
      setUser(data.user ?? null)
    } catch {
      setUser(null)
    }
  }, [])

  // Resolve the session once on mount.
  useEffect(() => {
    let active = true
    setIsLoading(true)
    refresh().finally(() => {
      if (active) {
        setIsLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [refresh])

  const signIn = useCallback(
    async (email: string, password: string): Promise<UserPublic> => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        throw new Error(await readError(res, "Incorrect email or password"))
      }

      await refresh()
      // `refresh` updates the context state asynchronously; also resolve the
      // user directly so callers get it without waiting for a re-render.
      const meRes = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      })
      const data = (await meRes.json()) as { user: UserPublic | null }
      if (!data.user) {
        throw new Error("Failed to resolve user after sign in")
      }
      setUser(data.user)
      return data.user
    },
    [refresh],
  )

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName?: string,
      options?: { autoSignIn?: boolean },
    ): Promise<void> => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      })

      if (!res.ok) {
        throw new Error(await readError(res, "Signup failed"))
      }

      // Signup does not set a cookie; optionally sign in to start a session.
      const autoSignIn = options?.autoSignIn ?? true
      if (autoSignIn) {
        await signIn(email, password)
      }
    },
    [signIn],
  )

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      signIn,
      signUp,
      signOut,
      refresh,
    }),
    [user, isLoading, signIn, signUp, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Access the auth state and actions. Must be used within an `<AuthProvider>`.
 *
 * @returns `{ user, isLoading, isAuthenticated, signIn, signUp, signOut, refresh }`
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an <AuthProvider>")
  }
  return ctx
}
