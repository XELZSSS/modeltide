import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router";

export interface ChartTheme {
  grid: string;
  tick: string;
  tickSecondary: string;
  tooltipBg: string;
  tooltipText: string;
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

export function useUrlTab<T extends string>(validTabs: readonly T[], fallback: T): [T, (tabId: string) => void] {
  const [activeTab, setActiveTab] = useUrlParam("tab", validTabs, fallback);
  const paramTab = useSearchParams()[0].get("tab");
  useEffect(() => {
    if (paramTab != null && !(validTabs as readonly string[]).includes(paramTab)) setActiveTab(fallback);
  }, [paramTab, fallback, setActiveTab, validTabs]);
  return [activeTab, setActiveTab];
}

export function useUrlParam<T extends string>(
  key: string,
  validValues: readonly T[],
  fallback: T,
): [T, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const writeParam = useCallback(
    (value: string) => {
      if (!(validValues as readonly string[]).includes(value)) return;
      setSearchParams(
        (prev) => {
          prev.set(key, value);
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams, key, validValues],
  );
  const raw = searchParams.get(key);
  const active = raw != null && (validValues as readonly string[]).includes(raw) ? (raw as T) : fallback;
  return [active, writeParam];
}
