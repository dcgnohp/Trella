import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const token = cookies().get("access_token")?.value;
  try {
    const resp = await fetch(
      `${BACKEND}/api/v1/workspaces/${params.workspaceId}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      }
    );
    if (!resp.ok) return NextResponse.json({ mode: "KANBAN" });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ mode: "KANBAN" });
  }
}
