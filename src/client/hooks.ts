import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router";

// ---- useChartTheme ----
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
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    grid: read("--border", "#e4e4e7"),
    tick: read("--text-tertiary", "#71717a"),
    tickSecondary: read("--text-secondary", "#52525b"),
    tooltipBg: read("--bg-secondary", "#ffffff"),
    tooltipText: read("--text-primary", "#111111"),
    palette: Array.from({ length: 10 }, (_, i) => read(`--chart-${i + 1}`, "")),
  };
}

// One shared DOM observer serves every chart instance.
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

/**
 * CSS-variable chart palette as concrete colors (canvas can't read var()).
 * Follows dark-mode toggles via the shared observer.
 */
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

// ---- useUrlTab ----
/**
 * Active tab id persisted as `?tab=` (replace navigation), so refreshes,
 * back navigation and deep links restore the tab.
 */
export function useUrlTab<T extends string>(validTabs: readonly T[], fallback: T): [T, (tabId: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const activeTab =
    paramTab != null && (validTabs as readonly string[]).includes(paramTab) ? (paramTab as T) : fallback;
  const setActiveTab = useCallback(
    (tabId: string) => {
      if (!(validTabs as readonly string[]).includes(tabId)) return;
      setSearchParams(
        (prev) => {
          prev.set("tab", tabId);
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams, validTabs],
  );
  return [activeTab, setActiveTab];
}
