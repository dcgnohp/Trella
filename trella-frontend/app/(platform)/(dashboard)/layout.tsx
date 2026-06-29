import { DashboardShell } from './_components/dashboard-shell';

const DashboardLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return <DashboardShell>{children}</DashboardShell>;
};

export default DashboardLayout;
