import type { TFunction } from "@/shared/i18n";
import { FALLBACK_DASH, FALLBACK_NA } from "@/shared/config/ui";

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Fractions in (0, 1] are scaled to a percentage; anything else is already one. */
export function unclampedPercent(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null;
  return value > 0 && value <= 1 ? value * 100 : value;
}

export function clampedPercent(value: number | null | undefined): number | null {
  const percent = unclampedPercent(value);
  return percent == null ? null : Math.max(0, Math.min(100, percent));
}

export function approxEq(a: number, b: number, eps = 1e-9): boolean {
  if (a === b) return true;
  return Math.abs(a - b) < eps * Math.max(1, Math.abs(a), Math.abs(b));
}

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
  { min: PROMOTE_1DEC * 1e9, div: 1e12, suffix: "T" },
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

function formatCompact(n: number | null | undefined, decimals = 2, fallback = FALLBACK_DASH): string {
  if (!isFiniteNumber(n)) return fallback;
  const { abs, sign } = compactParts(n);
  const scales = decimals === 1 ? TOKEN_SCALES : SHORT_SCALES;
  const scaled = formatScaled(abs, sign, abs, scales, decimals);
  if (scaled) return scaled;
  if (Number.isInteger(abs)) return `${sign}${abs}`;
  return `${sign}${parseFloat(abs.toFixed(decimals))}`;
}

export function formatShortNumber(n: number | null | undefined, fallback = FALLBACK_DASH): string {
  return formatCompact(n, 2, fallback);
}

export function formatTokens(n: number | null | undefined, t?: TFunction): string {
  if (!isFiniteNumber(n)) return t ? t("notAvailable") : FALLBACK_NA;
  const { abs } = compactParts(n);
  const scaled = formatScaled(abs, "", n, TOKEN_SCALES, 1);
  if (scaled) {
    const num = scaled.slice(0, -1);
    return `${num.endsWith(".0") ? num.slice(0, -2) : num}${scaled.charAt(scaled.length - 1)}`;
  }
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(1)));
}

export function formatScore(n: number | null | undefined, t: TFunction): string {
  if (!isFiniteNumber(n)) return t("notAvailable");
  if (Math.abs(n) > 1_000_000) return t("notAvailable");
  return n.toFixed(2);
}

/** One decimal percent; `signed` prefixes the "+" a rising figure needs. */
function percentText(v: number, signed = false): string {
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function formatPercent(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? percentText(v) : t("notAvailable");
}

const INDEX_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatIndex(v: number, fallback = FALLBACK_DASH): string {
  if (!isFiniteNumber(v)) return fallback;
  return INDEX_FORMATTER.format(v);
}

export function formatSpeed(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? formatIndex(v) : t("notAvailable");
}

export function formatTrend(change?: number | null, t?: TFunction): string {
  if (!isFiniteNumber(change)) return t ? t("notAvailable") : FALLBACK_NA;
  return percentText(change, true);
}
