import { useMutation } from "@tanstack/react-query";

import {
  AiService,
  type BreakdownResponse,
  type BreakdownRequest,
} from "@/lib/client";

export async function breakdownTask(
  payload: BreakdownRequest,
): Promise<BreakdownResponse> {
  return AiService.Ai_aiAiBreakdownTask({ requestBody: payload });
}

export function useBreakdownTask() {
  return useMutation<BreakdownResponse, Error, BreakdownRequest>({
    mutationFn: breakdownTask,
  });
}
