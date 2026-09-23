"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartBorder, chartGrid, chartPalette, chartSurface, chartText } from "./palette";

/**
 * Velocity over time. Data is pre-computed and passed via props.
 * Renders a muted message instead of an empty chart when there is no history.
 */
export function VelocityTrendChart({ data }: { data: { name: string; velocity: number }[] }) {
  if (data.length === 0) {
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
        No velocity history
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} aria-label="Velocity trend">
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: chartText }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: chartText }} />
        <Tooltip
          contentStyle={{
            fontSize: 13,
            background: chartSurface,
            border: `1px solid ${chartBorder}`,
            borderRadius: 6,
          }}
        />
        <Line
          type="monotone"
          dataKey="velocity"
          name="Velocity"
          stroke={chartPalette.information}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
