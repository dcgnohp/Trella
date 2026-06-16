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
 * `/sign-up` page (Requirements 13.4, 14.5).
 *
 * Client component built with shadcn `Form` + `react-hook-form` + `zod`.
 * On submit it calls `useAuth().signUp(email, password, fullName)`, which posts
 * to the `/api/auth/signup` Route Handler (`POST /api/v1/users/signup` on the
 * backend). The provider auto-signs-in after a successful registration (which
 * sets the httpOnly cookie via the login handler), so on success we redirect to
 * the post-signup destination. A 409 surfaces "Email already registered".
 */

/** Destination after a successful sign-up + auto sign-in. The org picker (task 22.1) takes over. */
const POST_SIGNUP_REDIRECT = "/organization"

const signUpSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type SignUpValues = z.infer<typeof signUpSchema>

export default function SignUpPage() {
  const router = useRouter()
  const { signUp } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  })

  const onSubmit = async (values: SignUpValues) => {
    setIsSubmitting(true)
    try {
      // `signUp` auto-signs-in by default, which sets the httpOnly cookie.
      await signUp(values.email, values.password, values.fullName)
      toast.success("Account created")
      router.push(POST_SIGNUP_REDIRECT)
      router.refresh()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Signup failed"
      toast.error(message)
      // 409 maps to an email conflict; show it on the email field, else password.
      if (message.toLowerCase().includes("email")) {
        form.setError("email", { type: "manual", message })
      } else {
        form.setError("password", { type: "manual", message })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Create an account</CardTitle>
        <CardDescription>
          Enter your details to get started.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      autoComplete="name"
                      placeholder="Ada Lovelace"
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
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
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
              Create account
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/sign-in"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
