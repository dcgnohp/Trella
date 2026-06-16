"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { CardsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { CopyCard } from "./schema";
import { InputType, ReturnType } from "./types";

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { id, boardId } = data;
  let card;

  try {
    // The backend creates "{title} - Copy" in the same list at order max+1 and
    // writes the CREATE audit log in one transaction (Req 7.6, 8.1).
    card = await CardsService.Cards_cardsCopyCard({
      cardId: id,
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to copy."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: card };
};

export const copyCard = createSafeAction(CopyCard, handler);
