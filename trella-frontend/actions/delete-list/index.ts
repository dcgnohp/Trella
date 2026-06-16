"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { ListsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { DeleteList } from "./schema";
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
    // Cascade delete of cards + DELETE audit log handled server-side in one
    // transaction (Req 6.3, 8.1).
    await ListsService.Lists_listsDeleteList({
      listId: id,
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to delete."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: undefined };
};

export const deleteList = createSafeAction(DeleteList, handler);
