import { useCallback, useState } from "react"

import { useQuery } from "@tanstack/react-query"

import {
  AiService,
  type SprintAnalysisRequest,
  type SprintAnalysisResponse,
} from "@/lib/client"
import { hashPayload } from "@/lib/ai/analytics-payload"

/**
 * User-triggered sprint analysis with payload-keyed caching.
 *
 * The query key is the payload hash and `staleTime` is long, so calling
 * `generate` again with an equal payload reuses the cached result and does NOT
 * trigger a new network/LLM call. `enabled` stays false until `generate` is
 * called, keeping the request user-triggered.
 */
export function useSprintAnalysis() {
  const [payload, setPayload] = useState<SprintAnalysisRequest | null>(null)
  const query = useQuery<SprintAnalysisResponse>({
    queryKey: ["ai-sprint-analysis", payload ? hashPayload(payload) : "idle"],
    queryFn: () => AiService.Ai_aiAiSprintAnalysis({ requestBody: payload! }),
    enabled: payload !== null,
    staleTime: 10 * 60 * 1000, // same payload within 10m → cache, no LLM call
    gcTime: 30 * 60 * 1000,
    retry: false,
  })
  const generate = useCallback((p: SprintAnalysisRequest) => setPayload(p), [])
  const reset = useCallback(() => setPayload(null), [])
  return { ...query, generate, reset, isIdle: payload === null }
}
