import { useMutation } from "@tanstack/react-query";

import {
  AiService,
  type DescriptionResponse,
  type GenerateDescriptionRequest,
} from "@/lib/client";

/**
 * Thin wrapper over the generated `AiService` for
 * `POST /api/v1/ai/tasks/generate-description`.
 *
 * Exported for unit testing (mock `AiService.Ai_aiAiGenerateDescription`);
 * prefer the `useGenerateDescription` hook in components.
 */
export async function generateDescription(
  payload: GenerateDescriptionRequest,
): Promise<DescriptionResponse> {
  return AiService.Ai_aiAiGenerateDescription({ requestBody: payload });
}

/**
 * Generate a structured task description from a short title/seed context.
 * Exposes TanStack Query mutation state (`isPending`, `isError`, `error`,
 * `data`, `reset`). Result is never auto-saved (design P1-F2).
 */
export function useGenerateDescription() {
  return useMutation<DescriptionResponse, Error, GenerateDescriptionRequest>({
    mutationFn: generateDescription,
  });
}
