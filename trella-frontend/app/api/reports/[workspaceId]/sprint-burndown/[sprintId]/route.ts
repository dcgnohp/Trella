import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(_req: NextRequest, { params }: { params: { workspaceId: string; sprintId: string } }) {
  const token = cookies().get("access_token")?.value;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const resp = await fetch(`${BACKEND}/api/v1/workspaces/${params.workspaceId}/reports/sprint-burndown/${params.sprintId}`, {
      headers,
      cache: "no-store",
    });
    if (!resp.ok) return NextResponse.json(null);
    return NextResponse.json(await resp.json());
  } catch {
    return NextResponse.json(null);
  }
}
