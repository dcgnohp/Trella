import { MembersScreen } from "./_components/members-screen";

export const metadata = {
  title: "Project Members",
};

/**
 * Route `/projects/{projectId}/settings/members` (Req 12).
 *
 * Renders the client-side members admin screen. Access is gated to
 * `PROJECT_ADMIN` inside `<MembersScreen>` (Req 12.1) using the caller's own
 * membership from the fetched member list.
 */
const ProjectMembersPage = ({ params }: { params: { projectId: string } }) => {
  return <MembersScreen projectId={params.projectId} />;
};

export default ProjectMembersPage;
