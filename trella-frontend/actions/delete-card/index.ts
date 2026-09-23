"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { CardsService } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { DeleteCard } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof DeleteCard>;
type ReturnType = ActionState<InputType, void>;

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
