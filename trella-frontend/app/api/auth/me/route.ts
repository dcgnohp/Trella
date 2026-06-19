import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"

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
