// Override org-level layout: no extra sidebar needed (AppSidebar is in DashboardShell)
const OrganizationLayout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  return <>{children}</>;
};

export default OrganizationLayout;
