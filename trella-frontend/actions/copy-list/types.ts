import { z } from "zod";
import { type ListPublic } from "@/lib/client";

import { ActionState } from "@/lib/create-safe-action";

import { CopyList } from "./schema";

export type InputType = z.infer<typeof CopyList>;
export type ReturnType = ActionState<InputType, ListPublic>;
