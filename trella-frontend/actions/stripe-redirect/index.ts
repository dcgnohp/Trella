"use server";

import { getCurrentUser } from "@/lib/auth";
import { createSafeAction } from "@/lib/create-safe-action";

import { StripeRedirect } from "./schema";
import { InputType, ReturnType } from "./types";

/**
 * Billing / Stripe is intentionally NOT part of Phase 1 (Requirement 10.3 — no
 * `/api/v1/billing/*` endpoints, `is_pro` always returns false). There is no
 * backend billing endpoint to call, so this action is a no-op that returns a
 * clear "not available" error instead of performing any Stripe work. The schema
 * and return contract are preserved so Phase 2 can wire in real billing.
 */
const handler = async (_data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  return {
    error: "Billing is not available in Phase 1.",
  };
};

export const stripeRedirect = createSafeAction(StripeRedirect, handler);
