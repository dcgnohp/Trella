import { useMutation } from "@tanstack/react-query";

import { AiService, type AIRequest, type AIResponse } from "@/lib/client";

/**
 * Thin wrapper over the generated `AiService` for `POST /api/v1/ai/generate`.
 * `AIRequest.prompt` is the name of a server-side prompt template; `variables`
 * fill its `{{placeholders}}`. Exported for unit testing; prefer `useAi`.
 */
export async function postGenerate(body: AIRequest): Promise<AIResponse> {
  return AiService.Ai_aiAiGenerate({ requestBody: body });
}

/** Non-streaming AI generation. Exposes TanStack Query mutation state
 *  (`isPending`, `isError`, `error`, `data`, `reset`). */
export function useAi() {
  return useMutation<AIResponse, Error, AIRequest>({
    mutationFn: postGenerate,
  });
}
