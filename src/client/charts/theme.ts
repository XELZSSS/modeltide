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

/**
 * What a chart uses when a token cannot be read (no layout yet, a renamed variable). It mirrors theme.css rather than the
 * pre-refactor navy palette, and it has a dark set: a single light fallback would paint light grid lines onto a dark
 * canvas, which is worse than no fallback at all. The palette is the shared constant itself — the consistency guard fails
 * the build if `theme.css` ever disagrees with it, so a copy here could only drift.
 */
function fallbackTheme(): ChartTheme {
  const dark = documentIsDark();
  return {
    grid: dark ? "rgba(250, 250, 250, 0.10)" : "#e4e4e7",
    tickSecondary: dark ? "#9f9fa9" : "#71717b",
    tooltipBg: dark ? "#27272a" : "#f4f4f5",
    tooltipText: dark ? "#fafafa" : "#09090b",
    palette: CHART_PALETTE,
    donut: DONUT_PALETTE,
  };
}

export const CHART_HEIGHT = "h-[160px] sm:h-[180px]";

export const FLEX_CHART_HEIGHT = `flex-1 min-h-[160px] ${CHART_HEIGHT}`;

// A radar's plot is square, so its shorter side decides the size: on a phone the card is ~300px wide, so the height
// has to reach that before the polygon stops growing (240px left a ~150px circle in a box twice as tall).
export const RADAR_CHART_HEIGHT = "h-[320px] sm:h-[400px]";

/**
 * Ten ranked categories of two bars. The height pays for the label row and the legend, not the bars: in a card this
 * wide the bar thickness comes from the category count against the plot *width*, so extra height buys nothing.
 */
export const RANKING_CHART_HEIGHT = "flex-1 min-h-[220px] sm:min-h-[240px]";

export const CHART_EMPTY_CLASS = "flex items-center justify-center text-center ui-body-secondary";

function chartFontFamily(): string {
  const fromCss = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return fromCss || FONT_STACK_SANS;
}

const CHART_FONT_SIZE = 12;

/** A fade long enough to read as an arrival, short enough that a panel following the cursor never feels laggy. */
const TOOLTIP_FADE_MS = 150;

/**
 * Chart.js tweens the tooltip's own geometry (`x`, `y`, `width`, `height`, `caretX`, `caretY`). On a duration the
 * panel glides after the cursor and the box resizes while the labels are already laid out against the old width, so
 * the text visibly drifts. The geometry snaps and only the fade animates: the panel still arrives softly, nothing
 * inside it slides. Under `prefers-reduced-motion` the fade is dropped too — motion.css zeroes every CSS duration for
 * that preference, and Chart.js animations are not CSS.
 */
function tooltipAnimations(): { numbers: { duration: number }; opacity: { duration: number } } {
  return { numbers: { duration: 0 }, opacity: { duration: prefersReducedMotion() ? 0 : TOOLTIP_FADE_MS } };
}

export function applyChartDefaults(chart: typeof ChartJS): void {
  chart.defaults.font.family = chartFontFamily();
  chart.defaults.font.size = CHART_FONT_SIZE;
  // Plugin defaults only exist once the Tooltip plugin has been registered, so register.ts calls this again after every
  // `register()` instead of relying on the module-level call alone.
  const plugins = (chart.defaults as unknown as { plugins?: Record<string, unknown> }).plugins;
  const tooltip = plugins?.tooltip as
    | { animations?: Record<string, { duration?: number }>; callbacks?: { labelColor?: unknown } }
    | undefined;
  // The default `labelColor` callback hard-codes the colour box to a square; overriding it here keeps every tooltip's
  // marker rounded without each chart having to redeclare the callback.
  if (tooltip?.callbacks) tooltip.callbacks.labelColor = tooltipLabelColor;
  if (!tooltip?.animations?.numbers || !tooltip.animations.opacity) return;
  const animations = tooltipAnimations();
  tooltip.animations.numbers.duration = animations.numbers.duration;
  tooltip.animations.opacity.duration = animations.opacity.duration;
}

export const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  // A zero-length data animation, not `false`: these charts show snapshots and must settle in the same frame, but the
  // plugin resolves its own tooltip animation from `chart.options.animation`, so `false` here switched off every hover
  // transition and the panel jumped into place.
  animation: { duration: 0 },
} as const;

export const axisTickStyle = (theme: ChartTheme) => ({ color: theme.tickSecondary, font: { size: 11 } });

const axisGridStyle = (theme: ChartTheme) => ({ color: theme.grid });

/** The axis line itself. Solid like the grid: a dashed frame reads as an unfinished plot rather than a chart edge. */
const axisBorderStyle = (theme: ChartTheme) => ({ color: theme.grid });

const TOOLTIP_MARKER_RADIUS = 3;

type TooltipType = "line" | "radar" | "bar" | "doughnut";

/**
 * Chart.js's default `labelColor` callback hard-codes `borderRadius: 0`, so every tooltip colour box is a square even
 * though the tooltip itself is rounded. This keeps the default colours and gives the marker the same 3px radius the
 * bars and slices use.
 */
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
    // The last square surface in the UI: every other floating panel is `rounded-lg`, and the tooltip is the one the
    // pointer sees most often.
    cornerRadius: 8,
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
  // `step` is always the axis step: both callers (the home bars and the radar) want the same gridline ceiling, so a
  // per-call step was a knob no caller ever turned.
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
      // A legend marker is one shape everywhere: a solid dot in the series colour. Chart.js derives a point marker's
      // radius as `boxHeight * √2 / 2`, so `pointStyleWidth` plus `boxHeight = size / √2` draw a circle exactly as tall
      // as the 12px label instead of the default 40px colour box.
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
      x: { grid: axisGridStyle(theme), border: axisBorderStyle(theme), ...x },
      y: { grid: axisGridStyle(theme), border: axisBorderStyle(theme), ...y },
    },
    plugins: {
      legend: legend ?? legendStyle(theme),
      tooltip: { ...defaultTooltipOptions(theme), callbacks: tooltip?.callbacks },
    },
  };
}
