/**
 * Client-side "previous analysis memory" (Phase 5 v2).
 *
 * The AI is payload-mode (stateless), so to support "What changed since last
 * analysis?" the frontend keeps a short summary of the LAST analysis in
 * `localStorage` and sends it back as `previousSummary` on the next request.
 * No DB, best-effort, client-side only. `formatPreviousSummary` is a pure
 * function and is exported for unit testing.
 */

export interface AnalysisMemory {
  executiveSummary: string
  healthScore?: number | null
  generatedAt: string // ISO
}

const PREFIX = "trella:ai-analysis:"

/** PURE: format a stored memory into the compact `previousSummary` string sent
 *  back to the AI. Exported for unit testing. */
export function formatPreviousSummary(mem: AnalysisMemory): string {
  const score = mem.healthScore != null ? ` (health ${mem.healthScore})` : ""
  return `[${mem.generatedAt}]${score} ${mem.executiveSummary}`
}

/** Save the latest analysis summary for a scope (e.g. "sprint:<wsId>"). Safe on
 *  server (no-op when localStorage is unavailable). */
export function saveAnalysisMemory(scopeKey: string, mem: AnalysisMemory): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return
    window.localStorage.setItem(PREFIX + scopeKey, JSON.stringify(mem))
  } catch {
    /* ignore quota/serialization errors — memory is best-effort */
  }
}

/** Load the previous summary string for a scope, or undefined if none/invalid. */
export function loadPreviousSummary(scopeKey: string): string | undefined {
  try {
    if (typeof window === "undefined" || !window.localStorage) return undefined
    const raw = window.localStorage.getItem(PREFIX + scopeKey)
    if (!raw) return undefined
    const mem = JSON.parse(raw) as AnalysisMemory
    if (!mem || typeof mem.executiveSummary !== "string") return undefined
    return formatPreviousSummary(mem)
  } catch {
    return undefined
  }
}
