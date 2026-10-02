import type { TFunction } from "@/shared/i18n";
import { isFiniteNumber } from "@/shared/utils";

function compactParts(n: number) {
  return { abs: Math.abs(n), sign: n < 0 ? "-" : "" };
}

const PROMOTE_2DEC = 999.995;
const PROMOTE_1DEC = 999.95;

const SHORT_SCALES: { min: number; div: number; suffix: string }[] = [
  { min: PROMOTE_2DEC * 1e9, div: 1e12, suffix: "T" },
  { min: PROMOTE_2DEC * 1e6, div: 1e9, suffix: "B" },
  { min: PROMOTE_2DEC * 1e3, div: 1e6, suffix: "M" },
  { min: 1e3, div: 1e3, suffix: "K" },
];

const TOKEN_SCALES: { min: number; div: number; suffix: string }[] = [
  { min: PROMOTE_1DEC * 1e6, div: 1e9, suffix: "B" },
  { min: PROMOTE_1DEC * 1e3, div: 1e6, suffix: "M" },
  { min: 1e3, div: 1e3, suffix: "K" },
];

interface ScaleEntry {
  min: number;
  div: number;
  suffix: string;
}

function formatScaled(abs: number, sign: string, value: number, scales: ScaleEntry[], decimals: number): string | null {
  for (const s of scales) {
    if (abs >= s.min) return `${sign}${(value / s.div).toFixed(decimals)}${s.suffix}`;
  }
  return null;
}

export function formatShortNumber(n: number | null | undefined, fallback = "—") {
  if (!isFiniteNumber(n)) return fallback;
  const { abs, sign } = compactParts(n);
  const scaled = formatScaled(abs, sign, abs, SHORT_SCALES, 2);
  if (scaled) return scaled;
  if (Number.isInteger(abs)) return `${sign}${abs}`;
  return `${sign}${parseFloat(abs.toFixed(2))}`;
}

export function formatTokens(n: number | null | undefined, t?: TFunction): string {
  if (!isFiniteNumber(n)) return t ? t("notAvailable") : "N/A";
  const { abs } = compactParts(n);
  const scaled = formatScaled(abs, "", n, TOKEN_SCALES, 1);
  if (scaled) {
    const [num, suffix] = [scaled.slice(0, -1), scaled.slice(-1)];
    return `${num.endsWith(".0") ? num.slice(0, -2) : num}${suffix}`;
  }
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(1)));
}

export function formatScore(n: number | null | undefined, t: TFunction) {
  if (!isFiniteNumber(n)) return t("notAvailable");
  if (Math.abs(n) > 1_000_000) return t("notAvailable");
  return n.toFixed(2);
}

export function formatPercent(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? `${v.toFixed(1)}%` : t("notAvailable");
}

export function formatUptimePct(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? `${(v * 100).toFixed(2)}%` : t("uptimeNoData");
}

export function formatLatencySec(ms: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(ms) ? `${(ms / 1000).toFixed(2)}s` : t("uptimeNoData");
}

const INDEX_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatIndex(v: number, fallback = "—"): string {
  if (!isFiniteNumber(v)) return fallback;
  return INDEX_FORMATTER.format(v);
}

export function formatSpeed(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? formatIndex(v) : t("notAvailable");
}

export function formatTrend(change?: number | null, t?: TFunction): string {
  if (!isFiniteNumber(change)) return t ? t("notAvailable") : "N/A";
  if (change === 0) return "0.0%";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}
