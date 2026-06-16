import { z } from "zod";
import { type ListPublic } from "@/lib/client";

import { ActionState } from "@/lib/create-safe-action";

import { UpdateListOrder } from "./schema";

export type InputType = z.infer<typeof UpdateListOrder>;
export type ReturnType = ActionState<InputType, ListPublic[]>;
