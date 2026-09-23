"use server";

import { ListsService, type ListPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/action-error";

import { CopyList } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof CopyList>;
type ReturnType = ActionState<InputType, ListPublic>;

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { id, boardId } = data;
  let list;

  try {
    list = await ListsService.Lists_listsCopyList({
      listId: id,
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to copy."),
    };
  }

  revalidatePath(`/board/${boardId}`);
  return { data: list };
};

export const copyList = createSafeAction(CopyList, handler);
