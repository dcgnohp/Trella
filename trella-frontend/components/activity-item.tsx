import { format } from "date-fns";

import type { AuditLogPublic } from "@/lib/client";
import { Avatar, AvatarImage } from "@/components/ui/avatar";

interface ActivityItemProps {
  data: AuditLogPublic;
};

function generateLogMessage(log: AuditLogPublic): string {
  const { action, entityTitle, entityType } = log;
  const entity = entityType.toLowerCase();

  switch (action) {
    case "CREATE":
      return `created ${entity} "${entityTitle}"`;
    case "UPDATE":
      return `updated ${entity} "${entityTitle}"`;
    case "DELETE":
      return `deleted ${entity} "${entityTitle}"`;
    default:
      return `unknown action ${entity} "${entityTitle}"`;
  }
}

export const ActivityItem = ({
  data,
}: ActivityItemProps) => {
  return (
    <li className="flex items-center gap-x-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={data.userImage ?? undefined} />
      </Avatar>
      <div className="flex flex-col space-y-0.5">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold lowercase text-neutral-700">
            {data.userName}
          </span> {generateLogMessage(data)}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(data.createdAt), "MMM d, yyyy 'at' h:mm a")}
        </p>
      </div>
    </li>
  );
};
