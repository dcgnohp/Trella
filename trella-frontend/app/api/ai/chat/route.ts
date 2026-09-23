import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { API_BASE_URL } from "@/lib/client-config"

// Dedicated streaming passthrough for chat. The catch-all proxy
// (app/api/v1/[[...path]]/route.ts) buffers the whole response via
// arrayBuffer(), which breaks SSE — so streaming needs its own route that
// pipes the backend ReadableStream through untouched.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const token = cookies().get("access_token")?.value

  const headers = new Headers({ "Content-Type": "application/json" })
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const url = `${API_BASE_URL}/api/v1/ai/chat`

  try {
    // `duplex: "half"` is required to stream a request body; it is not yet in
    // the lib.dom RequestInit type, hence the cast. Next 14 supports it.
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: req.body,
      cache: "no-store",
      duplex: "half",
    } as RequestInit & { duplex: "half" })

    // Pass the ReadableStream through WITHOUT buffering (no arrayBuffer/text).
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("Chat stream proxy error:", error)
    return NextResponse.json(
      { error: "Chat proxy connection error" },
      { status: 502 },
    )
  }
}
