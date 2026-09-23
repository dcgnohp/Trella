import { redirect } from "next/navigation";

interface OrganizationIdPageProps {
  params: { organizationId: string };
}

const OrganizationIdPage = async ({ params }: OrganizationIdPageProps) => {
  redirect(`/organization/${params.organizationId}/boards`);
};

export default OrganizationIdPage;
