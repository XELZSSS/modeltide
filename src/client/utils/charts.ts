import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
  type TooltipOptions,
} from "chart.js";
import type { ChartTheme } from "@/client/ui-hooks";

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
);

ChartJS.defaults.font.family =
  "'Inter Variable', -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
ChartJS.defaults.font.size = 12;

export const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
} as const;

export const axisTickStyle = (theme: ChartTheme) => ({ color: theme.tick, font: { size: 10 } });

export const axisGridStyle = (theme: ChartTheme) => ({ color: theme.grid });

export const axisDashedBorderStyle = (theme: ChartTheme) => ({ color: theme.grid, dash: [3, 3] as [number, number] });

export { legendStyle, seriesColor, hexToRgba, ceilToStep } from "@/client/utils/charts-theme";

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
