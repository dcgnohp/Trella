import { useMutation } from "@tanstack/react-query";

import {
  AiService,
  type StoryPointResponse,
  type StoryPointRequest,
} from "@/lib/client";

export async function estimateStoryPoints(
  payload: StoryPointRequest,
): Promise<StoryPointResponse> {
  return AiService.Ai_aiAiEstimateStoryPoints({ requestBody: payload });
}

export function useStoryPoints() {
  return useMutation<StoryPointResponse, Error, StoryPointRequest>({
    mutationFn: estimateStoryPoints,
  });
}
