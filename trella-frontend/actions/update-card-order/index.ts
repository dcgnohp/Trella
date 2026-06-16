"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { CardsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { UpdateCardOrder } from "./schema";
import { InputType, ReturnType } from "./types";

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { items, boardId } = data;
  let updatedCards;

  try {
    // The backend validates that every card (and its target list) belongs to
    // the same Board and applies all order/listId updates atomically, writing
    // audit logs in the same transaction (Req 7.4, 7.5, 11.1-11.4).
    updatedCards = await CardsService.Cards_cardsReorderCards({
      requestBody: {
        items: items.map((card) => ({
          id: card.id,
          order: card.order,
          listId: card.listId,
        })),
      },
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to reorder."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: updatedCards };
};

export const updateCardOrder = createSafeAction(UpdateCardOrder, handler);
