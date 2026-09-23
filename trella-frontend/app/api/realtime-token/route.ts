import { NextResponse } from "next/server";

import { getAuthToken } from "@/lib/auth";

/**
 * Hands the backend JWT to the browser so it can authenticate the WebSocket
 * upgrade (the token lives in an httpOnly cookie the WS client cannot read,
 * and a WS handshake cannot carry an Authorization header — so the realtime
 * layer forwards it as a `?token=` query param instead).
 *
 * Returns 401 with a null token when there is no authenticated session.
 */
export async function GET() {
  const token = getAuthToken();
  if (!token) {
    return NextResponse.json({ token: null }, { status: 401 });
  }
  return NextResponse.json(
    { token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
