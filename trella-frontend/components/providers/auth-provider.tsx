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

export interface AuthContextValue {
  user: UserPublic | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<UserPublic>
  signUp: (
    email: string,
    password: string,
    fullName?: string,
    options?: { autoSignIn?: boolean },
  ) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

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
      // Fetch user directly so callers get it without waiting for a re-render.
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an <AuthProvider>")
  }
  return ctx
}
