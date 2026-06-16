import { z } from "zod"

/**
 * Validation schema for creating an organization (Requirement 15.2).
 *
 * Mirrors the backend `OrganizationCreate` contract (`{ name: string }`). Used
 * for both client-side validation (shadcn `Form` + `react-hook-form`) and as a
 * server-side guard inside the `createOrganization` action.
 */
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
