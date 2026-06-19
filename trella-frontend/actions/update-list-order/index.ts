"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { ListsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { UpdateListOrder } from "./schema";
import { InputType, ReturnType } from "./types";

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
