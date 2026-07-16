"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartBorder, chartGrid, chartPalette, chartSurface, chartText } from "./palette";

/**
 * Burn chart of remaining work over time. Data is pre-computed and passed via
 * props. Returns null when there is nothing to show so the parent can decide.
 */
export function BurnChart({ data }: { data?: { day: string; remaining: number }[] }) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} aria-label="Burn chart">
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
        <XAxis dataKey="day" tick={{ fontSize: 12, fill: chartText }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: chartText }} />
        <Tooltip
          contentStyle={{
            fontSize: 13,
            background: chartSurface,
            border: `1px solid ${chartBorder}`,
            borderRadius: 6,
          }}
        />
        <Area
          type="monotone"
          dataKey="remaining"
          name="Remaining"
          stroke={chartPalette.information}
          fill={chartPalette.information}
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
