import { Toaster } from "sonner"

import { AuthProvider } from "@/components/providers/auth-provider"

/**
 * Layout for the `/sign-up` route (task 21.3).
 *
 * Mirrors the `/sign-in` layout: these auth pages live at the app root, outside
 * the `(platform)` route group that mounts `AuthProvider`, so they need their
 * own provider for `useAuth()` plus the sonner `<Toaster />` for toasts.
 */
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
