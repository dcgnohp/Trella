import { Toaster } from "sonner";

import { AuthProvider } from "@/components/providers/auth-provider";
import { ModalProvider } from "@/components/providers/modal-provider";
import { QueryProvider } from "@/components/providers/query-provider";

const PlatformLayout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  return (
    <AuthProvider>
      <QueryProvider>
        <Toaster />
        <ModalProvider />
        {children}
      </QueryProvider>
    </AuthProvider>
  );
};

export default PlatformLayout;
