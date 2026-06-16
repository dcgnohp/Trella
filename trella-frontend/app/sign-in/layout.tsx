import { Toaster } from "sonner"

import { AuthProvider } from "@/components/providers/auth-provider"

/**
 * Layout for the `/sign-in` route (task 21.3).
 *
 * These auth pages live at the app root — outside the `(platform)` route group
 * that mounts `AuthProvider` — so they need their own provider for `useAuth()`
 * to work. We also mount the sonner `<Toaster />` so error/success toasts can
 * render. Kept intentionally minimal (no dashboard chrome).
 */
const SignInLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthProvider>
      <Toaster />
      <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
        {children}
      </main>
    </AuthProvider>
  )
}

export default SignInLayout
