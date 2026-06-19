import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { ApiError } from "@/lib/client"
import {
  AUTH_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  getAuthCookieOptions,
  login,
} from "@/lib/auth"

export async function POST(req: Request) {
  let email: unknown
  let password: unknown

  try {
    const body = await req.json()
    email = body?.email
    password = body?.password
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    )
  }

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    )
  }

  try {
    const accessToken = await login(email, password)

    cookies().set(AUTH_COOKIE, accessToken, {
      ...getAuthCookieOptions(),
      maxAge: AUTH_COOKIE_MAX_AGE,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) {
      // Surface the backend status (e.g. 401 incorrect email/password).
      const status = error.status === 401 ? 401 : error.status || 502
      return NextResponse.json(
        { error: "Incorrect email or password" },
        { status },
      )
    }
    return NextResponse.json(
      { error: "Login failed" },
      { status: 502 },
    )
  }
}
