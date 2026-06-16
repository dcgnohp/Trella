import { AuditLogsService, type AuditLogPublic } from "@/lib/client";
import { ActivityItem } from "@/components/activity-item";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Org-scoped audit log list (Req 8.3, 16.3).
 *
 * Replaces the Prisma `db.auditLog.findMany` query with
 * `AuditLogsService.AuditLogs_listOrgAuditLogs({ orgId })`; the backend
 * enforces org membership and returns the page already ordered by
 * `created_at` descending (Req 8.3, 8.4). PART 1 fetches a single page —
 * pagination is a PART 2 follow-up.
 */
interface ActivityListProps {
  orgId: string;
}

export const ActivityList = async ({ orgId }: ActivityListProps) => {
  let auditLogs: AuditLogPublic[] = [];
  try {
    auditLogs = await AuditLogsService.AuditLogs_auditLogsListOrgAuditLogs({ orgId });
  } catch {
    // On a backend error (e.g. transient 5xx, or 403 if the user just lost
    // membership) render the empty state rather than crashing the page.
    auditLogs = [];
  }

  return (
    <ol className="space-y-4 mt-4">
      <p className="hidden last:block text-xs text-center text-muted-foreground">
        No activity found inside this organization
      </p>
      {auditLogs.map((log) => (
        <ActivityItem key={log.id} data={log} />
      ))}
    </ol>
  );
};

ActivityList.Skeleton = function ActivityListSkeleton() {
  return (
    <ol className="space-y-4 mt-4">
      <Skeleton className="w-[80%] h-14" />
      <Skeleton className="w-[50%] h-14" />
      <Skeleton className="w-[70%] h-14" />
      <Skeleton className="w-[80%] h-14" />
      <Skeleton className="w-[75%] h-14" />
    </ol>
  );
};
