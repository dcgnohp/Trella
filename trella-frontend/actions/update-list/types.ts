import { z } from "zod";
import { type ListPublic } from "@/lib/client";

import { ActionState } from "@/lib/create-safe-action";

import { UpdateList } from "./schema";

export type InputType = z.infer<typeof UpdateList>;
export type ReturnType = ActionState<InputType, ListPublic>;
