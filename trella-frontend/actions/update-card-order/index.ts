"use server";

import { CardsService, type app__schemas__task_cards_schema__CardPublic as CardPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/action-error";

import { UpdateCardOrder } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof UpdateCardOrder>;
type ReturnType = ActionState<InputType, CardPublic[]>;

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
