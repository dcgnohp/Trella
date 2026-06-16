"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

/**
 * `/sign-in` page (Requirements 13.3, 13.5, 14.5).
 *
 * Client component built with shadcn `Form` + `react-hook-form` + `zod`.
 * On submit it calls `useAuth().signIn(email, password)`, which posts to the
 * `/api/auth/login` Route Handler. That handler exchanges the credentials for a
 * JWT and sets the httpOnly cookie server-side (httpOnly cookies cannot be set
 * from client JS). On success we redirect to the post-login destination; on
 * failure (e.g. 401) we surface "Incorrect email or password".
 */

/** Destination after a successful sign-in. The org picker (task 22.1) takes over from here. */
const POST_LOGIN_REDIRECT = "/organization"

const signInSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

type SignInValues = z.infer<typeof signInSchema>

export default function SignInPage() {
  const router = useRouter()
  const { signIn } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (values: SignInValues) => {
    setIsSubmitting(true)
    try {
      await signIn(values.email, values.password)
      toast.success("Signed in")
      router.push(POST_LOGIN_REDIRECT)
      router.refresh()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Incorrect email or password"
      // Surface as both a toast and an inline form error for accessibility.
      toast.error(message)
      form.setError("password", { type: "manual", message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>
          Enter your email and password to access your account.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/sign-up"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
