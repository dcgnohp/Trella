"use server";

import { BoardsService, type BoardPublic } from "@/lib/client";
import { createSafeAction, ActionState } from "@/lib/create-safe-action";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/current-org";
import { getApiErrorMessage } from "@/lib/action-error";

import { z } from "zod";

type InputType = z.infer<typeof CreateBoard>;
type ReturnType = ActionState<InputType, BoardPublic>;
import { CreateBoard } from "./schema";

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { title, image } = data;

  const orgId = data.orgId ?? getCurrentOrgId();

  if (!orgId) {
    return {
      error: "Organization is required.",
    };
  }

  const [imageId, imageThumbUrl, imageFullUrl, imageLinkHTML, imageUserName] =
    image.split("|");

  if (
    !imageId ||
    !imageThumbUrl ||
    !imageFullUrl ||
    !imageUserName ||
    !imageLinkHTML
  ) {
    return {
      error: "Missing fields. Failed to create board.",
    };
  }

  let board;

  try {
    board = await BoardsService.Boards_boardsCreateBoard({
      requestBody: {
        orgId,
        title,
        imageId,
        imageThumbUrl,
        imageFullUrl,
        imageUserName,
        imageLinkHTML,
      },
    });
  } catch (error) {
    return {
      error: getApiErrorMessage(error, "Failed to create."),
    };
  }

  revalidatePath(`/workspaces/${board.orgId}/boards/${board.id}`);
  return { data: board };
};

export const createBoard = createSafeAction(CreateBoard, handler);
