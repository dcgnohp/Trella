import { z } from "zod";

import { ActionState } from "@/lib/create-safe-action";

import { DeleteList } from "./schema";

export type InputType = z.infer<typeof DeleteList>;
// The delete endpoint returns no body (204); nothing to surface as data.
export type ReturnType = ActionState<InputType, void>;
