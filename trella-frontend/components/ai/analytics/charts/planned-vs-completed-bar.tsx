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

import { chartBorder, chartGrid, chartPalette, chartSurface, chartText } from "./palette";

/**
 * Two-category bar chart comparing planned vs completed (points or tasks).
 * Values are pre-computed and passed via props.
 */
export function PlannedVsCompletedBar({
  planned,
  completed,
}: {
  planned: number;
  completed: number;
}) {
  const data = [
    { name: "Planned", value: planned, fill: chartPalette.neutral },
    { name: "Completed", value: completed, fill: chartPalette.success },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} aria-label="Planned vs completed">
        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: chartText }} />
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
        <Bar dataKey="value" name="Value" radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
