"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/current-org";
import { BoardsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { DeleteBoard } from "./schema";
import { InputType, ReturnType } from "./types";

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { id } = data;

  const orgId = data.orgId ?? getCurrentOrgId();

  if (!orgId) {
    return {
      error: "Organization is required.",
    };
  }

  try {
    await BoardsService.Boards_boardsDeleteBoard({
      boardId: id,
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to delete."),
    };
  }

  revalidatePath(`/organization/${orgId}`);
  redirect(`/organization/${orgId}`);
};

export const deleteBoard = createSafeAction(DeleteBoard, handler);
