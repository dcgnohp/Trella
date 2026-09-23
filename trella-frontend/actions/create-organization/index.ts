"use server"

import { revalidatePath } from "next/cache"

import { ApiError, OrganizationsService, type OrganizationPublic } from "@/lib/client"
import { getCurrentUser } from "@/lib/auth"
import { setCurrentOrgId } from "@/lib/current-org"

import { CreateOrganizationSchema, type CreateOrganizationInput } from "./schema"

export interface CreateOrganizationResult {
  data?: OrganizationPublic
  error?: string
  fieldErrors?: Partial<Record<keyof CreateOrganizationInput, string[]>>
}

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
