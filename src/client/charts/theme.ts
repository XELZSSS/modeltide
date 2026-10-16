import { ref, type Ref } from "vue";
import type { LegendOptions, ScaleOptions, TooltipCallbacks, TooltipItem, TooltipModel } from "chart.js";
import { axisDashedBorderStyle, axisGridStyle, chartBase, defaultTooltipOptions } from "./factory";
import { DONUT_FALLBACK, FALLBACK_THEME, type ChartTheme } from "./tokens";

export type { ChartTheme };

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

const theme = ref<ChartTheme>(currentTheme());

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
      theme.value = next;
    });
  };
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onMutate);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  media?.addEventListener?.("change", onMutate);
}

export function useChartTheme(): Ref<ChartTheme> {
  ensureObserver();
  return theme;
}

export const AXIS_MAX = 100;
export const AXIS_STEP = 20;

export function ceilToStep(peak: number, step = AXIS_STEP): number {
  return Math.ceil(peak / step) * step;
}

export function seriesColor(theme: ChartTheme, index: number): string {
  // Themes only come from resolveChartTheme/FALLBACK_THEME, whose palette
  // entries are always non-empty strings; `||` still covers a blank/missing slot.
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
