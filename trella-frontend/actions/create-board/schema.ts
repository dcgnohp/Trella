import { z } from "zod";

export const CreateBoard = z.object({
  title: z.string({
    required_error: "Title is required",
    invalid_type_error: "Title is required",
  }).min(3, {
    message: "Title is too short."
  }),
  image: z.string({
    required_error: "Image is required",
    invalid_type_error: "Image is required",
  }),
  // org_id of the currently selected Organization (Req 15.4). Optional in the
  // input: the action resolves it with the priority "explicit arg else
  // `getCurrentOrgId()` cookie" (task 22.1 org-id mechanism). The backend still
  // requires a concrete org_id, so the handler errors when neither is present.
  orgId: z.string().optional(),
});
