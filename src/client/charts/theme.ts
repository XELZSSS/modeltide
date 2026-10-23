import { ref, type Ref } from "vue";
import type {
  Chart as ChartJS,
  LegendOptions,
  ScaleOptions,
  TooltipCallbacks,
  TooltipItem,
  TooltipModel,
  TooltipOptions,
} from "chart.js";
import { FONT_STACK_SANS } from "@/shared/config/typography";

export interface ChartTheme {
  grid: string;
  tick: string;
  tickSecondary: string;
  tooltipBg: string;
  tooltipText: string;
  palette: string[];
  donut: string[];
}

const DONUT_FALLBACK = ["#36577d", "#1e2430", "#2f6d8a", "#2f7a4d", "#9a6b0a", "#9aa5b4"];

const FALLBACK_THEME: ChartTheme = {
  grid: "rgba(30, 36, 48, 0.14)",
  tick: "#8b96a5",
  tickSecondary: "#5b6675",
  tooltipBg: "#f1f4f7",
  tooltipText: "#1e2430",
  palette: [
    "#36577d",
    "#1e2430",
    "#5b6675",
    "#9aa5b4",
    "#2f7a4d",
    "#2f6d8a",
    "#9a6b0a",
    "#c03a30",
    "#6d85a2",
    "#c3ccd6",
  ],
  donut: DONUT_FALLBACK,
};

export const CHART_HEIGHT = "h-[160px] sm:h-[180px]";

export const FLEX_CHART_HEIGHT = `flex-1 min-h-[160px] ${CHART_HEIGHT}`;

export const RADAR_CHART_HEIGHT = "h-[280px] sm:h-[400px]";

export const CHART_EMPTY_CLASS = "flex items-center justify-center text-center ui-body-secondary";

function chartFontFamily(): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return FONT_STACK_SANS;
  const fromCss = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return fromCss || FONT_STACK_SANS;
}

const CHART_FONT_SIZE = 12;

/** Chart.js glides the tooltip over its own default duration; on a panel that follows the cursor that reads as lag. */
const TOOLTIP_ANIMATION_MS = 150;

export function applyChartDefaults(chart: typeof ChartJS): void {
  chart.defaults.font.family = chartFontFamily();
  chart.defaults.font.size = CHART_FONT_SIZE;
  // Plugin defaults only exist once the Tooltip plugin has been registered, so register.ts calls this again after every
  // `register()` instead of relying on the module-level call alone.
  const plugins = (chart.defaults as unknown as { plugins?: Record<string, unknown> }).plugins;
  const tooltip = plugins?.tooltip as
    | { animations?: { numbers?: { duration?: number }; opacity?: { duration?: number } } }
    | undefined;
  if (!tooltip?.animations?.numbers || !tooltip.animations.opacity) return;
  tooltip.animations.numbers.duration = TOOLTIP_ANIMATION_MS;
  tooltip.animations.opacity.duration = TOOLTIP_ANIMATION_MS;
}

export const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  // A zero-length data animation, not `false`: these charts show snapshots and must settle in the same frame, but the
  // plugin resolves its own tooltip animation from `chart.options.animation`, so `false` here switched off every hover
  // transition and the panel jumped into place.
  animation: { duration: 0 },
} as const;

export const axisTickStyle = (theme: ChartTheme) => ({ color: theme.tick, font: { size: 10 } });

const axisGridStyle = (theme: ChartTheme) => ({ color: theme.grid });

const axisDashedBorderStyle = (theme: ChartTheme) => ({ color: theme.grid, dash: [3, 3] as [number, number] });

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

function resolveChartTheme(): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    grid: read("--border", FALLBACK_THEME.grid),
    tick: read("--text-tertiary", FALLBACK_THEME.tick),
    tickSecondary: read("--text-secondary", FALLBACK_THEME.tickSecondary),
    tooltipBg: read("--bg-secondary", FALLBACK_THEME.tooltipBg),
    tooltipText: read("--text-primary", FALLBACK_THEME.tooltipText),
    palette: Array.from({ length: 10 }, (_, i) => read(`--chart-${i + 1}`, FALLBACK_THEME.palette[i] ?? "#888888")),
    donut: Array.from({ length: DONUT_FALLBACK.length }, (_, i) =>
      read(`--donut-${i + 1}`, DONUT_FALLBACK[i] ?? "#888888"),
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
  return [
    theme.grid,
    theme.tick,
    theme.tickSecondary,
    theme.tooltipBg,
    theme.tooltipText,
    ...theme.palette,
    ...theme.donut,
  ].join("\u0000");
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
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onMutate);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  media?.addEventListener?.("change", onMutate);
}

export function useChartTheme(): Ref<ChartTheme> {
  ensureObserver();
  themeRef ??= ref(currentTheme());
  return themeRef;
}

export const AXIS_MAX = 100;
export const AXIS_STEP = 20;

export function ceilToStep(peak: number, step = AXIS_STEP): number {
  return Math.ceil(peak / step) * step;
}

export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.palette[index % theme.palette.length] || "#888888";
}

export function legendStyle(theme: ChartTheme) {
  return { labels: { color: theme.tickSecondary, font: { size: 12 } } };
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
    scales: {
      x: { grid: axisGridStyle(theme), border: axisDashedBorderStyle(theme), ...x },
      y: { grid: axisGridStyle(theme), border: axisDashedBorderStyle(theme), ...y },
    },
    plugins: {
      legend: legend ?? legendStyle(theme),
      tooltip: { ...defaultTooltipOptions(theme), callbacks: tooltip?.callbacks },
    },
  };
}
