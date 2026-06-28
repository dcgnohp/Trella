import { Navbar } from "./_components/navbar";

const DashboardLayout = ({ 
  children
}: { 
  children: React.ReactNode;
 }) => {
  return (
    <div className="h-full">
      <Navbar />
      <main className="pt-14 h-full">{children}</main>
    </div>
  );
 };

 export default DashboardLayout;
