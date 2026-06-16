import { z } from "zod";

import { ActionState } from "@/lib/create-safe-action";

import { DeleteBoard } from "./schema";

export type InputType = z.infer<typeof DeleteBoard>;
// On success the action redirects, so no payload is returned.
export type ReturnType = ActionState<InputType, void>;
