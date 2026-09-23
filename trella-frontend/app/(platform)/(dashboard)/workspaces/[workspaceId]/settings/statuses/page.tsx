import { StatusMappingAdmin } from "./_components/status-mapping-admin"

/**
 * Status-mapping admin screen (Req 11, design §8.5.8A).
 *
 * Route: `/workspaces/{workspaceId}/settings/statuses`. Only WorkspaceRole
 * ADMIN or OWNER may manage statuses (Req 11.1); the ADMIN/OWNER guard +
 * redirect-with-toast lives in the client component because the toast (sonner)
 * and the redirect are client concerns (Req 11.2).
 */
const StatusesSettingsPage = ({
  params,
}: {
  params: { workspaceId: string }
}) => {
  return <StatusMappingAdmin workspaceId={params.workspaceId} />
}

export default StatusesSettingsPage
