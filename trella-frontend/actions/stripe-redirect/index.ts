"use server";

import { getCurrentUser } from "@/lib/auth";

import { StripeRedirect } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof StripeRedirect>;
type ReturnType = ActionState<InputType, string>;

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
