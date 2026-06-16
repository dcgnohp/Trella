"use server"

import { revalidatePath } from "next/cache"

import { ApiError, OrganizationsService, type OrganizationPublic } from "@/lib/client"
import { getCurrentUser } from "@/lib/auth"
import { setCurrentOrgId } from "@/lib/current-org"

import { CreateOrganizationSchema, type CreateOrganizationInput } from "./schema"

/**
 * Result of the `createOrganization` server action.
 *
 * Intentionally self-contained (no dependency on the `create-safe-action`
 * helper, which belongs to the Board/List/Card action refactor in task 22.2):
 *  - `data`        the created organization on success.
 *  - `error`       a user-facing error message on failure.
 *  - `fieldErrors` per-field validation messages (keyed by field name).
 */
export interface CreateOrganizationResult {
  data?: OrganizationPublic
  error?: string
  fieldErrors?: Partial<Record<keyof CreateOrganizationInput, string[]>>
}

/**
 * Create an organization (Requirements 15.2, 15.4).
 *
 * Flow:
 *  1. Ensure the caller is authenticated (cookie JWT resolves a user).
 *  2. Validate the `name` input.
 *  3. Call `POST /api/v1/organizations` via the generated client. The backend
 *     atomically creates the org + owning member + limit + subscription.
 *  4. Persist the new org id as the active organization (`org_id` cookie) so
 *     subsequent Board/List/Card requests are scoped to it.
 *  5. Revalidate org-related routes so the picker/sidebar pick up the new org.
 *
 * Returns a `CreateOrganizationResult`; the caller (create-org form) handles
 * redirecting to `/organization/{id}`.
 */
export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<CreateOrganizationResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: "You must be signed in to create an organization." }
  }

  const parsed = CreateOrganizationSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: "Invalid organization details.",
      fieldErrors: parsed.error.flatten().fieldErrors as CreateOrganizationResult["fieldErrors"],
    }
  }

  let organization: OrganizationPublic
  try {
    organization = await OrganizationsService.Organizations_organizationsCreateOrganization({
      requestBody: { name: parsed.data.name },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: "Could not create organization. Please try again." }
    }
    throw error
  }

  // Make the new organization the active one for org-scoped requests.
  setCurrentOrgId(organization.id)

  revalidatePath("/organization")
  revalidatePath(`/organization/${organization.id}`)

  return { data: organization }
}
