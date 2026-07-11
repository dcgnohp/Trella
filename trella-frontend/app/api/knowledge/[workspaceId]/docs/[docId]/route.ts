import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function GET(_req: NextRequest, { params }: { params: { workspaceId: string; docId: string } }) {
  const token = cookies().get("access_token")?.value;
  const resp = await fetch(`${BACKEND}/api/v1/workspaces/${params.workspaceId}/docs/${params.docId}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}

export async function PATCH(req: NextRequest, { params }: { params: { workspaceId: string; docId: string } }) {
  const token = cookies().get("access_token")?.value;
  const body = await req.json();
  const resp = await fetch(`${BACKEND}/api/v1/workspaces/${params.workspaceId}/docs/${params.docId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: { workspaceId: string; docId: string } }) {
  const token = cookies().get("access_token")?.value;
  const resp = await fetch(`${BACKEND}/api/v1/workspaces/${params.workspaceId}/docs/${params.docId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (resp.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await resp.json(), { status: resp.status });
}
