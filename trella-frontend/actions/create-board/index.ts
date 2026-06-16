"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/current-org";
import { BoardsService } from "@/lib/client";
import { createSafeAction } from "@/lib/create-safe-action";
import { getApiErrorMessage } from "@/lib/action-error";

import { InputType, ReturnType } from "./types";
import { CreateBoard } from "./schema";

const handler = async (data: InputType): Promise<ReturnType> => {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "Unauthorized",
    };
  }

  const { title, image } = data;

  // Resolve the active organization with the documented priority (task 22.1):
  // an explicit `orgId` from the form/route param, otherwise the `org_id`
  // cookie set by the org picker.
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
    // The backend enforces the free-tier board limit, increments OrgLimit and
    // writes the CREATE audit log inside the same transaction (Req 5.5, 8.1, 9.4).
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

  revalidatePath(`/board/${board.id}`);
  return { data: board };
};

export const createBoard = createSafeAction(CreateBoard, handler);
