import { NextResponse } from "next/server"

import { ApiError } from "@/lib/client"
import { signUp } from "@/lib/auth"

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
