import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { API_BASE_URL } from "@/lib/client-config"

async function handleProxy(
  req: Request,
  { params }: { params: { path?: string[] } },
) {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value

  const pathStr = params.path?.join("/") ?? ""
  const searchParams = new URL(req.url).search
  const url = `${API_BASE_URL}/api/v1/${pathStr}${searchParams}`

  const headers = new Headers(req.headers)
  // Remove host and connection headers to avoid backend issues
  headers.delete("host")
  headers.delete("connection")

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const method = req.method
  const hasBody = ["POST", "PUT", "PATCH"].includes(method)
  let body: Blob | undefined = undefined

  if (hasBody) {
    try {
      body = await req.blob()
    } catch {
      // Body may be empty or not readable as a blob
    }
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
    })

    let data: ArrayBuffer | undefined = undefined
    if (res.status !== 204 && res.status !== 304) {
      try {
        data = await res.arrayBuffer()
      } catch {
        // ignore
      }
    }
    const responseHeaders = new Headers(res.headers)
    // Avoid content-encoding compression mismatch issues
    responseHeaders.delete("content-encoding")

    return new NextResponse(data, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("Proxy error:", error)
    return NextResponse.json(
      { error: "Proxy connection error" },
      { status: 502 },
    )
  }
}

export async function GET(req: Request, context: any) {
  return handleProxy(req, context)
}

export async function POST(req: Request, context: any) {
  return handleProxy(req, context)
}

export async function PUT(req: Request, context: any) {
  return handleProxy(req, context)
}

export async function PATCH(req: Request, context: any) {
  return handleProxy(req, context)
}

export async function DELETE(req: Request, context: any) {
  return handleProxy(req, context)
}
