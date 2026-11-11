import { ref, type Ref } from "vue";
import type {
  Chart as ChartJS,
  ChartType,
  LegendOptions,
  ScaleOptions,
  TooltipCallbacks,
  TooltipItem,
  TooltipLabelStyle,
  TooltipModel,
  TooltipOptions,
} from "chart.js";
import { FONT_STACK_SANS } from "@/shared/config/typography";
import { CHART_PALETTE, DONUT_PALETTE } from "@/shared/config/ui";

interface ChartTheme {
  grid: string;
  /** Axis and legend text: the one quiet-but-legible step, AA on both backgrounds at 11–12px. */
  tickSecondary: string;
  tooltipBg: string;
  tooltipText: string;
  readonly palette: readonly string[];
  readonly donut: readonly string[];
}

/** The app toggles the `.dark` class and `color-scheme` on <html>; either is authoritative over the OS preference. */
function documentIsDark(): boolean {
  const root = document.documentElement;
  return root.classList.contains("dark") || root.style.colorScheme === "dark";
}

/** Motion is a preference, not a decoration: motion.css zeroes every duration for it, and Chart.js is not covered by CSS. */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fallback when a token cannot be read (no layout yet, renamed variable): it mirrors theme.css and needs a dark set — a light grid on a dark canvas is worse than nothing. */
function fallbackTheme(): ChartTheme {
  const dark = documentIsDark();
  return {
    grid: dark ? "rgba(250, 250, 250, 0.10)" : "#e4e4e7",
    tickSecondary: dark ? "#9f9fa9" : "#62626b",
    tooltipBg: dark ? "#27272a" : "#f4f4f5",
    tooltipText: dark ? "#fafafa" : "#09090b",
    palette: CHART_PALETTE,
    donut: DONUT_PALETTE,
  };
}

export const CHART_HEIGHT = "h-40 sm:h-45";

export const FLEX_CHART_HEIGHT = `flex-1 min-h-40 ${CHART_HEIGHT}`;

// A radar's plot is square, so the height has to reach the card's phone width before the polygon stops growing.
export const RADAR_CHART_HEIGHT = "h-80 sm:h-100";

/** Ten ranked categories of two bars: the height pays for the label row and legend — bar thickness comes from the plot width. */
export const RANKING_CHART_HEIGHT = "flex-1 min-h-55 sm:min-h-60";

export const CHART_EMPTY_CLASS = "flex items-center justify-center text-center ui-body-secondary";

function chartFontFamily(): string {
  const fromCss = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return fromCss || FONT_STACK_SANS;
}

const CHART_FONT_SIZE = 12;

/** A fade long enough to read as an arrival, short enough that a panel following the cursor never feels laggy. */
const TOOLTIP_FADE_MS = 150;

/**
 * Chart.js tweens tooltip numbers, so a laid-out value visibly slides while the panel follows the cursor: numbers snap,
 * only opacity fades (and not at all under reduced motion — motion.css zeroes CSS durations, Chart.js is not CSS).
 * Plugin defaults exist only once the Tooltip plugin is registered, so `register.ts` calls this again after each `register()`.
 */
export function applyChartDefaults(chart: typeof ChartJS): void {
  chart.defaults.font.family = chartFontFamily();
  chart.defaults.font.size = CHART_FONT_SIZE;
  const plugins = (chart.defaults as unknown as { plugins?: Record<string, unknown> }).plugins;
  const tooltip = plugins?.tooltip as
    | { animations?: Record<string, { duration?: number }>; callbacks?: { labelColor?: unknown } }
    | undefined;
  // The stock `labelColor` hard-codes a square box; overriding it keeps every tooltip marker rounded.
  if (tooltip?.callbacks) tooltip.callbacks.labelColor = tooltipLabelColor;
  if (!tooltip?.animations?.numbers || !tooltip.animations.opacity) return;
  tooltip.animations.numbers.duration = 0;
  tooltip.animations.opacity.duration = prefersReducedMotion() ? 0 : TOOLTIP_FADE_MS;
}

/** Responsive base for every chart: `maintainAspectRatio: false` lets the frame own the height. No `animation` here — `ChartCanvas` owns `animation: { duration: 0 }` and is the only caller of `chart.update("none")`. */
export const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
} as const;

export const axisTickStyle = (theme: ChartTheme) => ({ color: theme.tickSecondary, font: { size: 12 } });

/** The axis line and its grid share one colour: a lighter or dashed frame reads as an unfinished plot. */
const axisStyle = (theme: ChartTheme) => ({ color: theme.grid });

const TOOLTIP_MARKER_RADIUS = 3;

type TooltipType = "line" | "radar" | "bar" | "doughnut";

function tooltipLabelColor<TType extends ChartType>(item: TooltipItem<TType>): TooltipLabelStyle {
  const style = item.chart.getDatasetMeta(item.datasetIndex).controller.getStyle(item.dataIndex, false);
  return {
    borderColor: style.borderColor,
    backgroundColor: style.backgroundColor,
    borderWidth: style.borderWidth,
    borderDash: style.borderDash,
    borderDashOffset: style.borderDashOffset,
    borderRadius: TOOLTIP_MARKER_RADIUS,
  };
}

export function defaultTooltipOptions(theme: ChartTheme): Partial<TooltipOptions<TooltipType>> {
  return {
    backgroundColor: theme.tooltipBg,
    titleColor: theme.tooltipText,
    bodyColor: theme.tooltipText,
    borderColor: theme.grid,
    borderWidth: 1,
    cornerRadius: 10,
    padding: 10,
    boxPadding: 4,
    titleFont: { size: 12, weight: 600 },
    bodyFont: { size: 12 },
  };
}

function resolveChartTheme(): ChartTheme {
  const fallback = fallbackTheme();
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallbackValue: string) => styles.getPropertyValue(name).trim() || fallbackValue;
  return {
    grid: read("--border", fallback.grid),
    tickSecondary: read("--text-secondary", fallback.tickSecondary),
    tooltipBg: read("--bg-secondary", fallback.tooltipBg),
    tooltipText: read("--text-primary", fallback.tooltipText),
    palette: Array.from({ length: 10 }, (_, i) => read(`--chart-${i + 1}`, fallback.palette[i] ?? "#888888")),
    donut: Array.from({ length: DONUT_PALETTE.length }, (_, i) =>
      read(`--donut-${i + 1}`, fallback.donut[i] ?? "#888888"),
    ),
  };
}

let sharedTheme: ChartTheme | null = null;
let sharedSignature = "";
let observing = false;

function currentTheme(): ChartTheme {
  if (sharedTheme) return sharedTheme;
  sharedTheme = resolveChartTheme();
  sharedSignature = themeSignature(sharedTheme);
  return sharedTheme;
}

function themeSignature(theme: ChartTheme): string {
  return [theme.grid, theme.tickSecondary, theme.tooltipBg, theme.tooltipText, ...theme.palette, ...theme.donut].join(
    "\u0000",
  );
}

let themeRef: Ref<ChartTheme> | null = null;

function ensureObserver(): void {
  if (observing) return;
  observing = true;
  let scheduled = false;
  const onMutate = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const next = resolveChartTheme();
      const signature = themeSignature(next);
      if (signature === sharedSignature) return;
      sharedSignature = signature;
      sharedTheme = next;
      if (themeRef) themeRef.value = next;
    });
  };
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onMutate);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  media.addEventListener("change", onMutate);
}

export function useChartTheme(): Ref<ChartTheme> {
  ensureObserver();
  themeRef ??= ref(currentTheme());
  return themeRef;
}

export const AXIS_MAX = 100;
export const AXIS_STEP = 20;

export function ceilToStep(peak: number): number {
  return Math.ceil(peak / AXIS_STEP) * AXIS_STEP;
}

export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.palette[index % theme.palette.length] || "#888888";
}

const LEGEND_DOT_SIZE = 12;

export function legendStyle(theme: ChartTheme) {
  return {
    labels: {
      color: theme.tickSecondary,
      font: { size: LEGEND_DOT_SIZE },
      // A legend marker is one shape everywhere: Chart.js derives a point marker's radius as `boxHeight * √2 / 2`, so
      // `boxHeight = size / √2` draws a circle as tall as the 12px label instead of a full colour box.
      usePointStyle: true,
      pointStyle: "circle" as const,
      pointStyleWidth: LEGEND_DOT_SIZE,
      boxHeight: LEGEND_DOT_SIZE / Math.SQRT2,
      padding: 12,
    },
  };
}

interface CartesianChartOptions<Type extends "line" | "bar", X extends "category" | "linear"> {
  x: ScaleOptions<X>;
  y: ScaleOptions<"linear">;
  legend?: Partial<LegendOptions<Type>>;
  tooltip?: {
    callbacks?: Partial<TooltipCallbacks<Type, TooltipModel<Type>, TooltipItem<Type>>>;
  };
  interaction?: { mode: "index"; intersect: boolean };
}

export function cartesianChartOptions<Type extends "line" | "bar", X extends "category" | "linear" = "category">(
  theme: ChartTheme,
  { x, y, legend, tooltip, interaction }: CartesianChartOptions<Type, X>,
) {
  return {
    ...chartBase,
    ...(interaction ? { interaction } : {}),
    // The caller's own keys win: the category axis of a bar chart hides its gridlines, and that override arrives here.
    scales: {
      x: { grid: axisStyle(theme), border: axisStyle(theme), ...x },
      y: { grid: axisStyle(theme), border: axisStyle(theme), ...y },
    },
    plugins: {
      legend: legend ?? legendStyle(theme),
      tooltip: { ...defaultTooltipOptions(theme), callbacks: tooltip?.callbacks },
    },
  };
}
