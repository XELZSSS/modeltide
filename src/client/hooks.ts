import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router";

// ---- client/hooks/useChartTheme.ts ----
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

/**
 * Resolves the CSS-variable chart palette into concrete colors for canvas rendering
 * (canvas cannot read var()). Backed by a shared observer so dark-mode toggles
 * restyle every mounted chart regardless of React effect ordering.
 *
 * CSR-only app: `document` always exists at runtime, so the theme is resolved
 * synchronously on first render. There is intentionally no hardcoded fallback
 * copy of the palette — it would drift from `--chart-N` (as it did before).
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

// ---- client/hooks/useUrlTab.ts ----
/**
 * Active tab id persisted as `?tab=` in the URL (replace navigation, so tab
 * switches are UI state, not history entries) so refreshes, back navigation and
 * deep links all restore the tab the user was actually on.
 */
export function useUrlTab<T extends string>(validTabs: readonly T[], fallback: T): [T, (tabId: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const activeTab =
    paramTab != null && (validTabs as readonly string[]).includes(paramTab) ? (paramTab as T) : fallback;
  const setActiveTab = useCallback(
    (tabId: string) => {
      // Validate on write too: callers pass free-form strings, and an invalid
      // id would otherwise linger in ?tab= until the next read falls back.
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
