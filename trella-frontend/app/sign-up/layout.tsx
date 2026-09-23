import { Toaster } from "sonner"

import { AuthProvider } from "@/components/providers/auth-provider"

const SignUpLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthProvider>
      <Toaster />
      <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
        {children}
      </main>
    </AuthProvider>
  )
}

export default SignUpLayout
