"use server";

import { getCurrentUser } from "@/lib/auth";
import { createSafeAction } from "@/lib/create-safe-action";

import { StripeRedirect } from "./schema";
import { InputType, ReturnType } from "./types";

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
