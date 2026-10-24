import type { TFunction } from "@/shared/i18n";
import { FALLBACK_DASH, FALLBACK_NA } from "@/shared/config/ui";

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Scales a 0-1 ratio onto a 0-100 scale. The unit is declared by the caller, never sniffed from the value: anything
 * outside 0-1 is dropped (`null`) rather than rescaled by a guess, so a field that silently changed units shows up as
 * missing data instead of a plausible 100x error.
 *
 * Fields that legitimately leave 0-1 (the signed omniscience index, Briefcase Elo, the Cyber index) are declared in
 * `ABSOLUTE_SCORE_BENCHMARKS` and must not come through here.
 */
export function ratioToPercent(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value) || value < 0 || value > 1) return null;
  return value * 100;
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

/**
 * Compact scaled text for a count, always on `SHORT_SCALES`: the token table used to arrive through a `decimals === 1`
 * branch no caller ever reached — `formatTokens` picks the token scales itself — so the parameter is gone instead of
 * staying as a choice that cannot be made.
 */
function formatCompact(n: number | null | undefined, fallback = FALLBACK_DASH): string {
  if (!isFiniteNumber(n)) return fallback;
  const { abs, sign } = compactParts(n);
  const scaled = formatScaled(abs, sign, abs, SHORT_SCALES, 2);
  if (scaled) return scaled;
  if (Number.isInteger(abs)) return `${sign}${abs}`;
  return `${sign}${parseFloat(abs.toFixed(2))}`;
}

export function formatShortNumber(n: number | null | undefined, fallback = FALLBACK_DASH): string {
  return formatCompact(n, fallback);
}

export function formatTokens(n: number | null | undefined, t?: TFunction): string {
  if (!isFiniteNumber(n)) return t ? t("notAvailable") : FALLBACK_NA;
  // The sign travels on its own and the scaled figure is built from `abs`, so nothing has to be recovered from the
  // division — a negative token count reads as negative for the same reason a positive one does.
  const { abs, sign } = compactParts(n);
  const scaled = formatScaled(abs, sign, abs, TOKEN_SCALES, 1);
  if (scaled) {
    const num = scaled.slice(0, -1);
    return `${num.endsWith(".0") ? num.slice(0, -2) : num}${scaled.charAt(scaled.length - 1)}`;
  }
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(1)));
}

export function formatPercent(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? percentText(v) : t("notAvailable");
}

function percentText(v: number, signed = false): string {
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// Scores span several scales at once: percentages sit in 0-100, index scores a bit above, and Briefcase Elo around
// 1500. Decimals are kept where they carry signal and dropped where they are noise, so a column stays readable
// without inventing a unit suffix.
const SCORE_ONE_DECIMAL_AT = 100;
const SCORE_INTEGER_AT = 1000;

const INDEX_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatScore(n: number | null | undefined, t: TFunction): string {
  if (!isFiniteNumber(n)) return t("notAvailable");
  const magnitude = Math.abs(n);
  if (magnitude > 1_000_000) return t("notAvailable");
  if (magnitude >= SCORE_INTEGER_AT) return n.toFixed(0);
  if (magnitude >= SCORE_ONE_DECIMAL_AT) return n.toFixed(1);
  return n.toFixed(2);
}

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
