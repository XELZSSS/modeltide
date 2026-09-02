import {
  Chart as ChartJS,
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
import type { ChartTheme } from "@/client/hooks/useChartTheme";

// Register once centrally so lazy chunks don't each bundle a separate register call.
ChartJS.register(CategoryScale, LinearScale, RadialLinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);

// Canvas text cannot inherit the page font; align chart typography with the app webfont once.
ChartJS.defaults.font.family = "'Inter', system-ui, sans-serif";
ChartJS.defaults.font.size = 12;

// Chart palette referencing CSS variables so colors adapt to the active theme (DOM usage).
export const COOL_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
  "var(--chart-10)",
];

/** Shared sizing/animation baseline so every chart behaves identically. */
export const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
} as const;

/** Standard value-axis tick style (small muted text). */
export const axisTickStyle = (theme: ChartTheme) => ({ color: theme.tick, font: { size: 10 } });

/** Standard axis grid color. */
export const axisGridStyle = (theme: ChartTheme) => ({ color: theme.grid });

/** Standard dashed axis border. */
export const axisDashedBorderStyle = (theme: ChartTheme) => ({ color: theme.grid, dash: [3, 3] as [number, number] });

/** Standard multi-series legend style. */
export const legendStyle = (theme: ChartTheme) => ({ labels: { color: theme.tickSecondary, font: { size: 12 } } });

/** Line-drawing extras shared by multi-series line charts (monotone curves, small points). */
export const lineSeriesStyle = {
  borderWidth: 2.5,
  pointRadius: 3,
  pointHoverRadius: 5,
  cubicInterpolationMode: "monotone",
  spanGaps: false,
} as const;

/** Concrete color for a series slot, cycling through the theme palette. */
export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.palette[index % theme.palette.length]!;
}

/** Returns the chart color for a model, cycling through the palette. */
export function getModelColor(index: number): string {
  return COOL_COLORS[index % COOL_COLORS.length]!;
}

/** Converts a hex color like "#2563eb" to an rgba() string, for canvas fills that cannot read CSS vars. */
export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{3}$/i.test(value) && !/^[0-9a-f]{6}$/i.test(value)) {
    // Non-hex input (e.g. an oklch() or var() string) would silently hand canvas an
    // invalid color; warn so a palette change surfaces immediately instead of rendering blank.
    console.warn(`[charts] hexToRgba expected a 3/6-digit hex color, got: "${hex}"`);
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

/** Returns default tooltip options aligned with the app theme. */
export function defaultTooltipOptions(theme: ChartTheme): Partial<TooltipOptions<"line" | "radar" | "bar">> {
  return {
    backgroundColor: theme.tooltipBg,
    titleColor: theme.tooltipText,
    bodyColor: theme.tooltipText,
    borderColor: theme.grid,
    borderWidth: 1,
    cornerRadius: 6,
    titleFont: { size: 12 },
    bodyFont: { size: 12 },
  };
}

export { ChartJS };
