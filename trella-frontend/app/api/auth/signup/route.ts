import { NextResponse } from "next/server"

import { ApiError } from "@/lib/client"
import { signUp } from "@/lib/auth"

/**
 * Signup Route Handler (Requirements 13.4, 13.6).
 *
 * Registers a new user against the backend (`POST /api/v1/users/signup`). We
 * route this through a server-side handler — mirroring the login flow — so the
 * call goes through the configured generated client instead of a direct
 * cross-origin browser request, and so error handling stays consistent.
 *
 * Signup itself issues no cookie (the backend does not return a token); the
 * `useAuth()` hook performs an explicit sign-in afterwards when auto-login is
 * desired.
 *
 * Request body (JSON): `{ email: string, password: string, fullName?: string }`.
 */
export async function POST(req: Request) {
  let email: unknown
  let password: unknown
  let fullName: unknown

  try {
    const body = await req.json()
    email = body?.email
    password = body?.password
    fullName = body?.fullName
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  ) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    )
  }

  if (fullName !== undefined && fullName !== null && typeof fullName !== "string") {
    return NextResponse.json(
      { error: "Invalid full name" },
      { status: 400 },
    )
  }

  try {
    const user = await signUp(email, password, fullName ?? null)
    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiError) {
      // 409 "Email already registered" and 422 validation errors are surfaced
      // to the client so the sign-up page can display a meaningful message.
      const status = error.status || 502
      const message =
        status === 409
          ? "Email already registered"
          : "Signup failed"
      return NextResponse.json({ error: message }, { status })
    }
    return NextResponse.json({ error: "Signup failed" }, { status: 502 })
  }
}
