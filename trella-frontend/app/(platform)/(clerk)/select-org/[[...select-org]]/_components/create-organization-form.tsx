"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { createOrganization } from "@/actions/create-organization"
import {
  CreateOrganizationSchema,
  type CreateOrganizationInput,
} from "@/actions/create-organization/schema"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

/**
 * Create-organization form (Requirements 15.2, 14.5).
 *
 * shadcn `Form` + `react-hook-form` + `zod`. On submit it calls the
 * `createOrganization` server action (`POST /organizations` + persist active
 * org). On success it redirects to the new org's dashboard.
 */
export const CreateOrganizationForm = () => {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(CreateOrganizationSchema),
    defaultValues: { name: "" },
  })

  const onSubmit = async (values: CreateOrganizationInput) => {
    setIsSubmitting(true)
    try {
      const result = await createOrganization(values)

      if (result.fieldErrors?.name?.length) {
        form.setError("name", { type: "manual", message: result.fieldErrors.name[0] })
        return
      }

      if (result.error || !result.data) {
        const message = result.error ?? "Could not create organization."
        toast.error(message)
        form.setError("name", { type: "manual", message })
        return
      }

      toast.success("Organization created")
      router.push(`/organization/${result.data.id}`)
      router.refresh()
    } catch {
      toast.error("Could not create organization.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Acme Inc."
                  autoComplete="organization"
                  disabled={isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                You can create more organizations later.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Create organization
        </Button>
      </form>
    </Form>
  )
}
