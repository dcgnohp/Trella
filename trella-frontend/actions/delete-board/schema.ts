import { z } from "zod";

export const DeleteBoard = z.object({
  id: z.string(),
  // org_id of the currently selected Organization (Req 15.4). Optional in the
  // input: the action resolves it with the priority "explicit arg else
  // `getCurrentOrgId()` cookie" (task 22.1) to know which organization
  // dashboard to redirect back to after deletion.
  orgId: z.string().optional(),
});
