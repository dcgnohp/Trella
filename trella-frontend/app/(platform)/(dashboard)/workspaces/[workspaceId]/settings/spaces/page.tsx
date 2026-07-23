"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Spinner from "@atlaskit/spinner";

import { BoardsService, type BoardPublic } from "@/lib/client";
import { SettingsContainer, SettingsCard } from "../_components/settings-ui";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SpacesSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["boards", workspaceId],
    queryFn: () => BoardsService.Boards_boardsListBoards({ orgId: workspaceId }),
  });

  const boards: BoardPublic[] = data ?? [];

  return (
    <SettingsContainer
      breadcrumb={[{ label: "Admin settings" }, { label: "Spaces" }]}
      title="Spaces"
      description="Boards in this workspace. Each space groups its own tasks, columns, and members."
    >
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Spinner size="medium" />
        </div>
      ) : boards.length === 0 ? (
        <SettingsCard>
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--trella-text)", marginBottom: 4 }}>No spaces yet</div>
            <div style={{ fontSize: 13, color: "var(--trella-text-subtle)" }}>
              Create a board from the sidebar to get started.
            </div>
          </div>
        </SettingsCard>
      ) : (
        <SettingsCard title={`All spaces (${boards.length})`}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {boards.map((b, i) => (
              <Link
                key={b.id}
                href={`/workspaces/${workspaceId}/boards/${b.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 0",
                    borderBottom: i === boards.length - 1 ? "none" : "1px solid var(--trella-border-subtle)",
                  }}
                >
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                      background: b.imageThumbUrl
                        ? `center/cover url(${b.imageThumbUrl})`
                        : "linear-gradient(135deg,#0052CC,#6554C0)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 15, fontWeight: 800,
                    }}
                  >
                    {!b.imageThumbUrl && b.title.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--trella-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--trella-text-subtle)", marginTop: 2 }}>
                      Created {formatDate(b.createdAt)}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--trella-brand)" }}>Open →</span>
                </div>
              </Link>
            ))}
          </div>
        </SettingsCard>
      )}
    </SettingsContainer>
  );
}
