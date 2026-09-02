import { useEffect, useState } from "react";

export interface ChartTheme {
  grid: string;
  tick: string;
  tickSecondary: string;
  tooltipBg: string;
  tooltipText: string;
  /** Concrete color per palette slot, aligned with COOL_COLORS / --chart-N order. */
  palette: string[];
}

function resolveChartTheme(): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  return {
    grid: read("--border"),
    tick: read("--text-tertiary"),
    tickSecondary: read("--text-secondary"),
    tooltipBg: read("--bg-secondary"),
    tooltipText: read("--text-primary"),
    palette: Array.from({ length: 10 }, (_, i) => read(`--chart-${i + 1}`)),
  };
}

// Theme changes are global; a single DOM observer serves every chart instance
// instead of each chart mounting its own MutationObserver + matchMedia listener.
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
  media?.addEventListener?.("change", notify);
}

const SSR_FALLBACK: ChartTheme = {
  grid: "#e4e4e7",
  tick: "#8f97a5",
  tickSecondary: "#5b6472",
  tooltipBg: "#f4f4f5",
  tooltipText: "#0b1220",
  palette: ["#2563eb", "#ea580c", "#0d9488", "#7c3aed", "#e11d48", "#d97706", "#0891b2", "#db2777", "#059669", "#c026d3"],
};

/**
 * Resolves the CSS-variable chart palette into concrete colors for canvas rendering
 * (canvas cannot read var()). Backed by a shared observer so dark-mode toggles
 * restyle every mounted chart regardless of React effect ordering.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => {
    if (typeof document === "undefined") return SSR_FALLBACK;
    ensureObserver();
    return sharedTheme!;
  });
  useEffect(() => {
    if (typeof document === "undefined") return;
    ensureObserver();
    const listener = (next: ChartTheme) => setTheme(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return theme;
}
