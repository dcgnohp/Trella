"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { ListsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { CreateList } from "./schema";
import { InputType, ReturnType } from "./types";

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { title, boardId } = data;
  let list;

  try {
    // The backend derives `order` as max(order)+1, scopes the board via org
    // membership and writes the CREATE audit log (Req 6.1, 4.4, 8.1).
    list = await ListsService.Lists_listsCreateList({
      requestBody: {
        title,
        boardId,
      },
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to create."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: list };
};

export const createList = createSafeAction(CreateList, handler);
