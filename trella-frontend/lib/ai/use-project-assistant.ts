import { useCallback, useState } from "react"

import { useQuery } from "@tanstack/react-query"

import {
  AiService,
  type ProjectAssistantRequest,
  type ProjectAssistantResponse,
} from "@/lib/client"
import { hashPayload } from "@/lib/ai/analytics-payload"

/**
 * User-triggered project assistant with payload-keyed caching.
 *
 * The query key is the payload hash and `staleTime` is long, so calling
 * `generate` again with an equal payload reuses the cached result and does NOT
 * trigger a new network/LLM call. `enabled` stays false until `generate` is
 * called, keeping the request user-triggered.
 */
export function useProjectAssistant() {
  const [payload, setPayload] = useState<ProjectAssistantRequest | null>(null)
  const query = useQuery<ProjectAssistantResponse>({
    queryKey: ["ai-project-assistant", payload ? hashPayload(payload) : "idle"],
    queryFn: () => AiService.Ai_aiAiProjectAssistant({ requestBody: payload! }),
    enabled: payload !== null,
    staleTime: 10 * 60 * 1000, // same payload within 10m → cache, no LLM call
    gcTime: 30 * 60 * 1000,
    retry: false,
  })
  const generate = useCallback((p: ProjectAssistantRequest) => setPayload(p), [])
  const reset = useCallback(() => setPayload(null), [])
  return { ...query, generate, reset, isIdle: payload === null }
}
