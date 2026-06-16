import { z } from "zod";
import { type app__schemas__task_cards_schema__CardPublic as CardPublic } from "@/lib/client";

import { ActionState } from "@/lib/create-safe-action";

import { UpdateCard } from "./schema";

export type InputType = z.infer<typeof UpdateCard>;
export type ReturnType = ActionState<InputType, CardPublic>;
