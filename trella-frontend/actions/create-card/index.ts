"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { CardsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { CreateCard } from "./schema";
import { InputType, ReturnType } from "./types";

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { title, boardId, listId } = data;
  let card;

  try {
    // The backend derives `order` as max(order)+1, scopes via list -> board ->
    // org_id and writes the CREATE audit log (Req 7.1, 4.4, 8.1).
    card = await CardsService.Cards_cardsCreateCard({
      requestBody: {
        title,
        listId,
      },
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to create."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: card };
};

export const createCard = createSafeAction(CreateCard, handler);
