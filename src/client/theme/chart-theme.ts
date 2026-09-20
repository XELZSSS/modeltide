"use client";
import { useEffect, useState } from "react";

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
    grid: read("--border", "rgba(30, 36, 48, 0.14)"),
    tick: read("--text-tertiary", "#8b96a5"),
    tickSecondary: read("--text-secondary", "#5b6675"),
    tooltipBg: read("--bg-secondary", "#f1f4f7"),
    tooltipText: read("--text-primary", "#1e2430"),
    palette: Array.from({ length: 10 }, (_, i) => read(`--chart-${i + 1}`, FALLBACK_THEME.palette[i] ?? "#888888")),
    donut: Array.from({ length: DONUT_FALLBACK.length }, (_, i) =>
      read(`--donut-${i + 1}`, DONUT_FALLBACK[i] ?? "#888888"),
    ),
  };
}

let sharedTheme: ChartTheme | null = null;
const listeners = new Set<(theme: ChartTheme) => void>();
let observing = false;

function ensureObserver(): void {
  if (observing || typeof document === "undefined") return;
  observing = true;
  sharedTheme = resolveChartTheme();
  const notify = () => {
    sharedTheme = resolveChartTheme();
    for (const listener of listeners) listener(sharedTheme!);
  };
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  // Accent switches (body[data-accent]) re-derive chart vars via color-mix.
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-accent"] });
  media?.addEventListener?.("change", notify);
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => {
    ensureObserver();
    return sharedTheme ?? resolveChartTheme();
  });
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
    // Non-hex (var()/rgb()/named): leave blending to CSS. Empty input is
    // guarded above so this never emits an invalid color-mix().
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
