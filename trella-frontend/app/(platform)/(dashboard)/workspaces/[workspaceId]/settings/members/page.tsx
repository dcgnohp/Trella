import { WorkspaceMembersScreen } from "./_components/workspace-members-screen";

export const metadata = {
  title: "Workspace Members",
};

const WorkspaceMembersPage = ({
  params,
}: {
  params: { workspaceId: string };
}) => {
  return <WorkspaceMembersScreen workspaceId={params.workspaceId} />;
};

export default WorkspaceMembersPage;
