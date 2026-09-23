"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Spinner from "@atlaskit/spinner";

import { WorkspacesService } from "@/lib/client";
import { SettingsContainer, SettingsCard, FieldRow } from "../_components/settings-ui";

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const MODE_LABEL: Record<string, string> = {
  KANBAN: "Kanban (Trello style)",
  SCRUM: "Scrum (Jira style)",
};

function Value({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span style={{ fontSize: 13, color: "var(--trella-text)", fontFamily: mono ? "monospace" : undefined }}>
      {children}
    </span>
  );
}

export default function SystemSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data: ws, isLoading } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => WorkspacesService.Workspaces_workspacesGetWorkspace({ workspaceId }),
  });

  return (
    <SettingsContainer
      breadcrumb={[{ label: "Admin settings" }, { label: "System" }]}
      title="System"
      description="General configuration and information for this workspace."
    >
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Spinner size="medium" />
        </div>
      ) : !ws ? (
        <SettingsCard>
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--trella-text-subtle)", fontSize: 13 }}>
            Workspace not found or you don&apos;t have access.
          </div>
        </SettingsCard>
      ) : (
        <>
          <SettingsCard title="Workspace information" description="Core details about this workspace.">
            <FieldRow label="Name" control={<Value>{ws.name}</Value>} />
            <FieldRow label="Workspace ID" control={<Value mono>{ws.id}</Value>} />
            <FieldRow
              label="Mode"
              hint="Determines whether the workspace uses Kanban boards or Scrum sprints."
              control={<Value>{ws.mode ? MODE_LABEL[ws.mode] ?? ws.mode : "—"}</Value>}
            />
            <FieldRow label="Created" control={<Value>{formatDateTime(ws.createdAt)}</Value>} />
            <FieldRow label="Last updated" control={<Value>{formatDateTime(ws.updatedAt)}</Value>} last />
          </SettingsCard>

          <SettingsCard
            title="Configuration & danger zone"
            description="Workspace mode upgrade and destructive actions are managed on the organization settings page."
          >
            <FieldRow
              label="Manage workspace"
              hint="Upgrade the workspace mode or delete the workspace."
              control={
                <Link
                  href={`/organization/${ws.id}/settings`}
                  style={{
                    display: "inline-flex", alignItems: "center", padding: "7px 14px",
                    fontSize: 13, fontWeight: 600, color: "var(--trella-text)",
                    background: "var(--trella-surface)", border: "1px solid var(--trella-border-strong)",
                    borderRadius: 6, textDecoration: "none",
                  }}
                >
                  Open organization settings
                </Link>
              }
              last
            />
          </SettingsCard>
        </>
      )}
    </SettingsContainer>
  );
}
