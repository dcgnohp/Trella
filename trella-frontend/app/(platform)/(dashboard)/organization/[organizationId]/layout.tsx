import { OrgControl } from "./_components/org-control";

const OrganizationIdLayout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  return (
    <>
      <OrgControl />
      <div style={{ padding: '32px 40px', maxWidth: 1200, color: '#E0E6F0' }}>
        {children}
      </div>
    </>
  );
};

export default OrganizationIdLayout;
