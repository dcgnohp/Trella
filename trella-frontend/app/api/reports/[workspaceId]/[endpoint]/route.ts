import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function GET(_req: NextRequest, { params }: { params: { workspaceId: string; endpoint: string } }) {
  const token = cookies().get("access_token")?.value;
  try {
    const resp = await fetch(`${BACKEND}/api/v1/workspaces/${params.workspaceId}/reports/${params.endpoint}`, {
      headers: authHeaders(token),
      cache: "no-store",
    });
    if (!resp.ok) return NextResponse.json([]);
    return NextResponse.json(await resp.json());
  } catch {
    return NextResponse.json([]);
  }
}
