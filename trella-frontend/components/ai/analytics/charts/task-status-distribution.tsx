"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { chartBorder, chartPalette, chartSurface } from "./palette";

/**
 * Pie of task counts by status. Data is pre-computed and passed via props.
 */
export function TaskStatusDistribution({
  todo,
  inProgress,
  done,
}: {
  todo: number;
  inProgress: number;
  done: number;
}) {
  const data = [
    { name: "To Do", value: todo, fill: chartPalette.neutral },
    { name: "In Progress", value: inProgress, fill: chartPalette.information },
    { name: "Done", value: done, fill: chartPalette.success },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart aria-label="Task status distribution">
        <Pie data={data} dataKey="value" nameKey="name" outerRadius="80%" stroke="none">
          {data.map((slice) => (
            <Cell key={slice.name} fill={slice.fill} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            fontSize: 13,
            background: chartSurface,
            border: `1px solid ${chartBorder}`,
            borderRadius: 6,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
