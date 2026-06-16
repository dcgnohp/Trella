import { Toaster } from "sonner";

import { AuthProvider } from "@/components/providers/auth-provider";
import { ModalProvider } from "@/components/providers/modal-provider";
import { QueryProvider } from "@/components/providers/query-provider";

// ClerkProvider was removed (task 19.1). Auth context is now provided by the
// JWT cookie based flow: AuthProvider exposes `useAuth()` (task 21.2), backed
// by lib/auth.ts + the /api/auth/* Route Handlers.
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
