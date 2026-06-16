"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { BoardsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { UpdateBoard } from "./schema";
import { InputType, ReturnType } from "./types";

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
    // Org membership is enforced server-side; the UPDATE audit log is written
    // by the backend in the same transaction (Req 4.1, 8.1).
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
