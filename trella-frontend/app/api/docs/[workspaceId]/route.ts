import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function GET(_req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const token = cookies().get("access_token")?.value;
  try {
    const resp = await fetch(`${BACKEND}/api/v1/workspaces/${params.workspaceId}/docs`, {
      headers: authHeaders(token),
      cache: "no-store",
    });
    if (!resp.ok) return NextResponse.json([]);
    return NextResponse.json(await resp.json());
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const token = cookies().get("access_token")?.value;
  const body = await req.json();
  const resp = await fetch(`${BACKEND}/api/v1/workspaces/${params.workspaceId}/docs`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
