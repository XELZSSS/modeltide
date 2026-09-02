import type { ChartTheme } from "@/client/ui-hooks";

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
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{3}$/i.test(value) && !/^[0-9a-f]{6}$/i.test(value)) {
    const pct = Math.round(alpha * 100);
    return `color-mix(in srgb, ${hex} ${pct}%, transparent)`;
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
