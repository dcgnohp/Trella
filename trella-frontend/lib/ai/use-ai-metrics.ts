import { useQuery } from "@tanstack/react-query"

import { AiService } from "@/lib/client"

/**
 * AI Ops metrics (Phase 6, P6-F1). The `/ai/metrics` endpoint returns a plain
 * dict (NOT a CamelModel), so the keys stay snake_case on the wire — the types
 * below reflect that exactly.
 */
export interface KeyMetrics {
  feature: string
  provider: string
  model: string
  requests: number
  successes: number
  failures: number
  cache_hits: number
  cache_misses: number
  avg_latency_ms: number | null
  total_cost: number
  avg_cost: number | null
  cost_per_successful_request: number | null
}

export interface RollupMetrics {
  requests: number
  total_cost: number
}

export interface MetricsSnapshot {
  by_key: Record<string, KeyMetrics>
  daily: Record<string, RollupMetrics>
  monthly: Record<string, RollupMetrics>
}

export interface AiMetricsResponse {
  metrics: MetricsSnapshot
  recent_traces: number
}

/**
 * Superuser-only AI operations metrics. Polls every 15s while `enabled`.
 * `retry: false` so a 403 (non-superuser) surfaces immediately instead of
 * hammering the endpoint.
 */
export function useAiMetrics(enabled: boolean) {
  return useQuery({
    queryKey: ["ai-metrics"],
    queryFn: async () =>
      (await AiService.Ai_aiAiMetrics()) as unknown as AiMetricsResponse,
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    retry: false,
  })
}
