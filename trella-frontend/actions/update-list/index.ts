"use server";

import { ListsService, type ListPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/action-error";

import { UpdateList } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof UpdateList>;
type ReturnType = ActionState<InputType, ListPublic>;

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { title, id, boardId } = data;
  let list;

  try {
    // Org scope is resolved server-side via list -> board -> org_id.
    list = await ListsService.Lists_listsUpdateList({
      listId: id,
      requestBody: {
        title,
      },
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to update."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: list };
};

export const updateList = createSafeAction(UpdateList, handler);
