"use server";

import { ListsService, type ListPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/action-error";

import { CreateList } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof CreateList>;
type ReturnType = ActionState<InputType, ListPublic>;

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
