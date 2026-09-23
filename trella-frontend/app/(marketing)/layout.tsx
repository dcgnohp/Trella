import { AuthProvider } from "@/components/providers/auth-provider";
import { Navbar } from "./_components/navbar";

const MarketingLayout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#F8FAFC]">
        <Navbar />
        <main className="bg-[#F8FAFC] min-h-screen">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
};

export default MarketingLayout;
