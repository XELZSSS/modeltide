"use client";
// No chart.js import here: helper-only imports must not pull chart.js in.
import type { Chart as ChartJS, TooltipOptions } from "chart.js";
import type { ChartTheme } from "@/client/theme/chart-theme";

const CHART_FONT_FAMILY =
  "'Inter Variable', -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
const CHART_FONT_SIZE = 12;

export function applyChartDefaults(chart: typeof ChartJS): void {
  chart.defaults.font.family = CHART_FONT_FAMILY;
  chart.defaults.font.size = CHART_FONT_SIZE;
}

export const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
} as const;

export const axisTickStyle = (theme: ChartTheme) => ({ color: theme.tick, font: { size: 10 } });

export const axisGridStyle = (theme: ChartTheme) => ({ color: theme.grid });

export const axisDashedBorderStyle = (theme: ChartTheme) => ({ color: theme.grid, dash: [3, 3] as [number, number] });

export const lineSeriesStyle = {
  borderWidth: 2,
  pointRadius: 0,
  pointHoverRadius: 4,
  pointStyle: "rect",
  cubicInterpolationMode: "monotone",
  spanGaps: false,
} as const;

export function defaultTooltipOptions(
  theme: ChartTheme,
): Partial<TooltipOptions<"line" | "radar" | "bar" | "doughnut">> {
  return {
    backgroundColor: theme.tooltipBg,
    titleColor: theme.tooltipText,
    bodyColor: theme.tooltipText,
    borderColor: theme.grid,
    borderWidth: 1,
    cornerRadius: 0,
    titleFont: { size: 12 },
    bodyFont: { size: 12 },
  };
}
