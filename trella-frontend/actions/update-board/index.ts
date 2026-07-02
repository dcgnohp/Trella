"use server";

import { BoardsService, type BoardPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/action-error";

import { UpdateBoard } from "./schema";
import { z } from "zod";

type InputType = z.infer<typeof UpdateBoard>;
type ReturnType = ActionState<InputType, BoardPublic>;

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { title, id } = data;
  let board;

  try {
    board = await BoardsService.Boards_boardsUpdateBoard({
      boardId: id,
      requestBody: {
        title,
      },
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to update."),
    };
  }

  revalidatePath(`/board/${id}`);
  return { data: board };
};

export const updateBoard = createSafeAction(UpdateBoard, handler);
