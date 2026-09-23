import { useMutation } from "@tanstack/react-query";

import {
  AiService,
  type SummarizeRequest,
  type SummaryResponse,
} from "@/lib/client";

/**
 * Thin wrapper over the generated `AiService` for
 * `POST /api/v1/ai/tasks/summarize`.
 *
 * Exported for unit testing (mock `AiService.Ai_aiAiSummarizeTask`); prefer
 * the `useSummarizeTask` hook in components.
 */
export async function summarizeTask(
  payload: SummarizeRequest,
): Promise<SummaryResponse> {
  return AiService.Ai_aiAiSummarizeTask({ requestBody: payload });
}

/**
 * Summarize an existing task description into summary/risks/action items.
 * Exposes TanStack Query mutation state (`isPending`, `isError`, `error`,
 * `data`, `reset`). Result is never auto-saved (design P1-F3).
 */
export function useSummarizeTask() {
  return useMutation<SummaryResponse, Error, SummarizeRequest>({
    mutationFn: summarizeTask,
  });
}
