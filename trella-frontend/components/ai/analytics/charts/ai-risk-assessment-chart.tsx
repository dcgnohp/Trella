"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RiskItem } from "@/lib/client";

import { chartBorder, chartGrid, chartPalette, chartSurface, chartText } from "./palette";

/** Fixed severity order the chart always renders, even for zero counts. */
const SEVERITY_ORDER = ["low", "medium", "high", "critical"] as const;

/**
 * Pure, DOM-free data shaper: count risks per severity in a fixed order.
 * Unknown/unexpected severities are ignored so the output stays stable.
 */
export function countRisksBySeverity(risks: RiskItem[]): { severity: string; count: number }[] {
  const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const risk of risks) {
    if (risk.severity in counts) {
      counts[risk.severity] += 1;
    }
  }
  return SEVERITY_ORDER.map((severity) => ({ severity, count: counts[severity] }));
}

function colorForSeverity(severity: string): string {
  switch (severity) {
    case "low":
      return chartPalette.success;
    case "medium":
      return chartPalette.warning;
    default:
      // high + critical
      return chartPalette.danger;
  }
}

/**
 * Bar chart of the AI's risk assessment by severity. Data is pre-computed
 * from the risks prop; the component never fetches.
 */
export function AiRiskAssessmentChart({ risks }: { risks: RiskItem[] }) {
  if (risks.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontSize: 13,
          color: chartText,
        }}
      >
        No risks identified
      </div>
    );
  }

  const data = countRisksBySeverity(risks);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} aria-label="AI risk assessment">
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
        <XAxis dataKey="severity" tick={{ fontSize: 12, fill: chartText }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: chartText }} />
        <Tooltip
          cursor={{ fill: chartGrid }}
          contentStyle={{
            fontSize: 13,
            background: chartSurface,
            border: `1px solid ${chartBorder}`,
            borderRadius: 6,
          }}
        />
        <Bar dataKey="count" name="Risks" radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.severity} fill={colorForSeverity(entry.severity)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
