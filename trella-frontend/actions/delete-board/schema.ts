import { z } from "zod";

export const DeleteBoard = z.object({
  id: z.string(),
  orgId: z.string().optional(),
});
