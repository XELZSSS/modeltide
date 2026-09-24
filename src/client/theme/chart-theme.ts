import { useEffect, useState } from "react";
import type { LegendOptions, ScaleOptions, TooltipCallbacks, TooltipItem, TooltipModel } from "chart.js";
import { axisDashedBorderStyle, axisGridStyle, chartBase, defaultTooltipOptions } from "@/client/utils/charts";

export interface ChartTheme {
  grid: string;
  tick: string;
  tickSecondary: string;
  tooltipBg: string;
  tooltipText: string;
  palette: string[];
  donut: string[];
}

const DONUT_FALLBACK = ["#365899", "#1e2430", "#2f6d8a", "#2f7a4d", "#9a6b0a", "#9aa5b4"];

const FALLBACK_THEME: ChartTheme = {
  grid: "rgba(30, 36, 48, 0.14)",
  tick: "#8b96a5",
  tickSecondary: "#5b6675",
  tooltipBg: "#f1f4f7",
  tooltipText: "#1e2430",
  palette: [
    "#365899",
    "#1e2430",
    "#5b6675",
    "#9aa5b4",
    "#2f7a4d",
    "#2f6d8a",
    "#9a6b0a",
    "#c03a30",
    "#6d7a99",
    "#c3ccd6",
  ],
  donut: DONUT_FALLBACK,
};

function resolveChartTheme(): ChartTheme {
  if (typeof document === "undefined") return FALLBACK_THEME;
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
const listeners = new Set<(theme: ChartTheme) => void>();
let observing = false;

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

function publish(next: ChartTheme): void {
  const signature = themeSignature(next);
  if (signature === sharedSignature) return;
  sharedSignature = signature;
  sharedTheme = next;
  for (const listener of listeners) listener(next);
}

function ensureObserver(): void {
  if (observing || typeof document === "undefined") return;
  observing = true;
  sharedTheme = resolveChartTheme();
  sharedSignature = themeSignature(sharedTheme);
  const notify = () => publish(resolveChartTheme());
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  media?.addEventListener?.("change", notify);
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => sharedTheme ?? resolveChartTheme());
  useEffect(() => {
    ensureObserver();
    const listener = (next: ChartTheme) => setTheme(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return theme;
}

export function ceilToStep(peak: number, step = 20): number {
  return Math.ceil(peak / step) * step;
}

export function seriesColor(theme: ChartTheme, index: number): string {
  const fallback = "#888888";
  if (theme.palette.length === 0) return fallback;
  const raw = theme.palette[index % theme.palette.length];
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  return raw;
}

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.trim()) return `rgba(136, 136, 136, ${alpha})`;
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{3}$/i.test(value) && !/^[0-9a-f]{6}$/i.test(value)) {
    const pct = Math.round(alpha * 100);
    return `color-mix(in srgb, ${hex.trim()} ${pct}%, transparent)`;
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
