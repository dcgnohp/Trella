"use server";

import { CardsService, type app__schemas__task_cards_schema__CardPublic as CardPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/action-error";

import { CopyCard } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof CopyCard>;
type ReturnType = ActionState<InputType, CardPublic>;

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
