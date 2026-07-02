"use server";

import { CardsService, type app__schemas__task_cards_schema__CardPublic as CardPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/action-error";

import { UpdateCard } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof UpdateCard>;
type ReturnType = ActionState<InputType, CardPublic>;

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { id, boardId, title, description } = data;
  let card;

  try {
    card = await CardsService.Cards_cardsUpdateCard({
      cardId: id,
      requestBody: {
        title,
        description,
      },
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to update."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: card };
};

export const updateCard = createSafeAction(UpdateCard, handler);
