import { token } from "@atlaskit/tokens";

/**
 * Small shared chart palette built from ADS chart tokens with hex fallbacks.
 * Keep this the single source of truth so every chart stays visually consistent.
 */
export const chartPalette = {
  success: token("color.chart.success", "#22a06b"),
  neutral: token("color.chart.neutral", "#8993a4"),
  information: token("color.chart.information", "#1d7afc"),
  warning: token("color.chart.warning", "#e56910"),
  danger: token("color.chart.danger", "#e2483d"),
} as const;

/** Text/grid tokens reused across charts. */
export const chartText = token("color.text.subtle", "#44546f");
export const chartGrid = token("color.border", "#091e4224");
export const chartSurface = token("elevation.surface", "#ffffff");
export const chartBorder = token("color.border", "#091e4224");
