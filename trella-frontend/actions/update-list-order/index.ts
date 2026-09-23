"use server";

import { ListsService, type ListPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/action-error";

import { UpdateListOrder } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof UpdateListOrder>;
type ReturnType = ActionState<InputType, ListPublic[]>;

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { items, boardId } = data;
  let lists;

  try {
    lists = await ListsService.Lists_listsReorderLists({
      requestBody: {
        boardId,
        items: items.map((list) => ({
          id: list.id,
          order: list.order,
        })),
      },
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to reorder."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: lists };
};

export const updateListOrder = createSafeAction(UpdateListOrder, handler);
