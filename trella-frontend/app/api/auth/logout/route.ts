import { NextResponse } from "next/server"

import { signOut } from "@/lib/auth"

/**
 * Logout Route Handler (Requirement 13.6).
 *
 * Clears the httpOnly auth cookie. A Route Handler is required because cookies
 * can only be mutated from a Server Action or Route Handler.
 */
export async function POST() {
  signOut()
  return NextResponse.json({ success: true })
}
