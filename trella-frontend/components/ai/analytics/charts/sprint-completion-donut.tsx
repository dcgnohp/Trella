"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { chartPalette } from "./palette";

/**
 * Donut showing sprint completion: completed slice vs remaining (100 - rate).
 * Receives an already-computed completion rate (0-100) via props; never fetches.
 */
export function SprintCompletionDonut({ completionRate }: { completionRate: number }) {
  // Clamp defensively — the rate crosses a component boundary (trust boundary).
  const rate = Math.max(0, Math.min(100, Math.round(completionRate)));
  const data = [
    { name: "Completed", value: rate },
    { name: "Remaining", value: 100 - rate },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart aria-label="Sprint completion">
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="60%"
          outerRadius="85%"
          startAngle={90}
          endAngle={-270}
          stroke="none"
        >
          <Cell fill={chartPalette.success} />
          <Cell fill={chartPalette.neutral} />
        </Pie>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: 22, fontWeight: 700, fill: chartPalette.success }}
        >
          {rate}%
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}
