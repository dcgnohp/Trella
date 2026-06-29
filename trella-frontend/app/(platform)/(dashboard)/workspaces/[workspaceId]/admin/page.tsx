import { AdminDashboardClient } from './_components/admin-dashboard-client';

interface AdminPageProps {
  params: { workspaceId: string };
}

export const metadata = { title: 'Admin Dashboard' };

export default function AdminPage({ params }: AdminPageProps) {
  // ponytail: role comes from API — passing 'ADMIN' as default until role endpoint is wired
  return (
    <AdminDashboardClient
      workspaceId={params.workspaceId}
      userRole="ADMIN"
    />
  );
}
