"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { CardsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { DeleteCard } from "./schema";
import { InputType, ReturnType } from "./types";

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { id, boardId } = data;

  try {
    await CardsService.Cards_cardsDeleteCard({
      cardId: id,
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to delete."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: undefined };
};

export const deleteCard = createSafeAction(DeleteCard, handler);
