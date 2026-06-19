import { z } from "zod"

export const CreateOrganizationSchema = z.object({
  name: z
    .string({
      required_error: "Organization name is required",
      invalid_type_error: "Organization name is required",
    })
    .trim()
    .min(2, { message: "Organization name must be at least 2 characters" })
    .max(60, { message: "Organization name must be 60 characters or fewer" }),
})

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>
