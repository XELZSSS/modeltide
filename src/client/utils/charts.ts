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
// NOTE: adding Doughnut/Pie/Time/Log scales needs ArcElement/TimeScale/
// LogarithmicScale registered here first, or Chart.js throws
// "Scale is not registered" at runtime in the lazy chunk.
import type { ChartTheme } from "@/client/hooks";

// Register once centrally so lazy chunks don't each repeat it.
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

// Canvas text can't inherit the page font; align chart typography once.
ChartJS.defaults.font.family =
  "'Inter Variable', -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
ChartJS.defaults.font.size = 12;

/** Shared sizing/animation baseline. */
export const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
} as const;

/** Standard value-axis tick style. */
export const axisTickStyle = (theme: ChartTheme) => ({ color: theme.tick, font: { size: 10 } });

/** Standard axis grid color. */
export const axisGridStyle = (theme: ChartTheme) => ({ color: theme.grid });

/** Standard dashed axis border. */
export const axisDashedBorderStyle = (theme: ChartTheme) => ({ color: theme.grid, dash: [3, 3] as [number, number] });

/** Standard multi-series legend style. */
export const legendStyle = (theme: ChartTheme) => ({ labels: { color: theme.tickSecondary, font: { size: 12 } } });

/** Line-chart extras shared by multi-series line charts. */
export const lineSeriesStyle = {
  borderWidth: 2,
  pointRadius: 0,
  pointHoverRadius: 4,
  pointStyle: "rect",
  cubicInterpolationMode: "monotone",
  spanGaps: false,
} as const;

/** Concrete color for a series slot, cycling the theme palette. */
export function seriesColor(theme: ChartTheme, index: number): string {
  const fallback = "#888888";
  if (theme.palette.length === 0) return fallback;
  const raw = theme.palette[index % theme.palette.length];
  // CSS var missing (empty string) or whitespace: fall back instead of
  // handing Chart.js a transparent/invalid color.
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  return raw;
}

/**
 * Hex color to rgba() for canvas fills. Non-hex theme values (rgb()/oklch()/
 * color-mix) pass through silently — the theme palette comes from computed
 * styles and is rarely raw hex.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{3}$/i.test(value) && !/^[0-9a-f]{6}$/i.test(value)) {
    return hex;
  }
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return hex;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Default tooltip options aligned with the app theme. */
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
