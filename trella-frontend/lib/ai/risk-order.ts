import type { RiskItem } from "@/lib/client"

const SEVERITY_WEIGHT: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

/** Sort Top Risks by severity (critical→low) then confidence desc. Non-mutating. */
export function sortRisksByImportance(risks: RiskItem[]): RiskItem[] {
  return [...risks].sort((a, b) => {
    const bySeverity = (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0)
    if (bySeverity !== 0) return bySeverity
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })
}
