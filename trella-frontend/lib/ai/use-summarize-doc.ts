import { useMutation } from "@tanstack/react-query";

import {
  AiService,
  type DocSummaryRequest,
  type DocSummaryResponse,
} from "@/lib/client";

/**
 * Thin wrapper over the generated `AiService` for
 * `POST /api/v1/ai/docs/summarize`.
 *
 * Exported for unit testing (mock `AiService.Ai_aiAiSummarizeDocument`); prefer
 * the `useSummarizeDoc` hook in components.
 */
export async function summarizeDoc(
  payload: DocSummaryRequest,
): Promise<DocSummaryResponse> {
  return AiService.Ai_aiAiSummarizeDocument({ requestBody: payload });
}

/**
 * Summarize a Knowledge Center document into summary/key points/key
 * decisions/action items. Exposes TanStack Query mutation state (`isPending`,
 * `isError`, `error`, `data`, `reset`). Read-only — result is never auto-saved
 * back to the document (design P3-F2).
 */
export function useSummarizeDoc() {
  return useMutation<DocSummaryResponse, Error, DocSummaryRequest>({
    mutationFn: summarizeDoc,
  });
}
