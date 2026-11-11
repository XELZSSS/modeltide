import type { TFunction } from "@/shared/i18n";
import { FALLBACK_DASH, FALLBACK_NA } from "@/shared/config/ui";

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Scales a 0-1 ratio onto a 0-100 scale; anything outside 0-1 is dropped (`null`) rather than rescaled by a guess, so a
 * field that changed units shows up as missing data instead of a plausible 100x error. Fields that legitimately leave
 * 0-1 (the signed omniscience index, Briefcase Elo, the Cyber index) are declared in `ABSOLUTE_SCORE_BENCHMARKS`.
 */
export function ratioToPercent(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value) || value < 0 || value > 1) return null;
  return value * 100;
}

const APPROX_EPS = 1e-9;

export function approxEq(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) < APPROX_EPS * Math.max(1, Math.abs(a), Math.abs(b));
}

function compactParts(n: number) {
  return { abs: Math.abs(n), sign: n < 0 ? "-" : "" };
}

const PROMOTE_2DEC = 999.995;
const PROMOTE_1DEC = 999.95;

interface ScaleEntry {
  min: number;
  div: number;
  suffix: string;
}

/** The K/M/B/T ladder both formatters walk: they differ only in how early a value promotes to the next suffix. */
const scaleLadder = (promote: number): ScaleEntry[] => [
  { min: promote * 1e9, div: 1e12, suffix: "T" },
  { min: promote * 1e6, div: 1e9, suffix: "B" },
  { min: promote * 1e3, div: 1e6, suffix: "M" },
  { min: 1e3, div: 1e3, suffix: "K" },
];

const SHORT_SCALES = scaleLadder(PROMOTE_2DEC);
const TOKEN_SCALES = scaleLadder(PROMOTE_1DEC);

interface ScaledText {
  num: string;
  suffix: string;
}

function formatScaled(abs: number, sign: string, scales: ScaleEntry[], decimals: number): ScaledText | null {
  for (const s of scales) {
    if (abs >= s.min) return { num: `${sign}${(abs / s.div).toFixed(decimals)}`, suffix: s.suffix };
  }
  return null;
}

/** Compact scaled text for a count, always on `SHORT_SCALES`; `formatTokens` picks the token scales itself. */
export function formatShortNumber(n: number | null | undefined, fallback = FALLBACK_DASH): string {
  if (!isFiniteNumber(n)) return fallback;
  const { abs, sign } = compactParts(n);
  const scaled = formatScaled(abs, sign, SHORT_SCALES, 2);
  if (scaled) return `${scaled.num}${scaled.suffix}`;
  if (Number.isInteger(abs)) return `${sign}${abs}`;
  return `${sign}${parseFloat(abs.toFixed(2))}`;
}

export function formatTokens(n: number | null | undefined, t?: TFunction): string {
  if (!isFiniteNumber(n)) return t ? t("notAvailable") : FALLBACK_NA;
  // The sign travels on its own and the scaled figure is built from `abs`, so nothing has to be recovered from the division.
  const { abs, sign } = compactParts(n);
  const scaled = formatScaled(abs, sign, TOKEN_SCALES, 1);
  if (scaled) return `${scaled.num.replace(/\.0$/, "")}${scaled.suffix}`;
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(1)));
}

export function formatPercent(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? percentText(v) : t("notAvailable");
}

function percentText(v: number, signed = false): string {
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

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

/**
 * A benchmark value on the scale the upstream sent it - no scaling, no percentage - printed to exactly `RATIO_DECIMALS`
 * places: `0.917171717171717` prints `0.92`, `0.8` prints `0.80`, and a fixed two places keeps a grid aligned.
 */
const RATIO_DECIMALS = 2;

export function formatRatio(v: number | null | undefined, t: TFunction): string {
  if (!isFiniteNumber(v)) return t("notAvailable");
  const text = v.toFixed(RATIO_DECIMALS);
  // Below the printable step the value is not zero, so it reports its bound — the way a sub-cent price prints "<$0.0001".
  if (Number(text) === 0 && v !== 0) {
    const bound = (10 ** -RATIO_DECIMALS).toFixed(RATIO_DECIMALS);
    return v < 0 ? `>-${bound}` : `<${bound}`;
  }
  return text;
}

export function formatIndex(v: number, fallback = FALLBACK_DASH): string {
  if (!isFiniteNumber(v)) return fallback;
  return INDEX_FORMATTER.format(v);
}

export function formatSpeed(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? formatIndex(v) : t("notAvailable");
}

/**
 * The trend column is two digits wide (`+96.0%`): a seven-day window can produce four-digit growth, which overflowed the
 * column, so anything past `TREND_MAX_PERCENT` reports its bound the way `formatRatio` reports a sub-printable one. The
 * comparison uses the value as it will be *printed* (rounded to one decimal) rather than as stored.
 */
const TREND_MAX_PERCENT = 99;

export function formatTrend(change?: number | null, t?: TFunction): string {
  if (!isFiniteNumber(change)) return t ? t("notAvailable") : FALLBACK_NA;
  const printed = Math.round(change * 10) / 10;
  if (printed > TREND_MAX_PERCENT) return `>${TREND_MAX_PERCENT}%`;
  if (printed < -TREND_MAX_PERCENT) return `<-${TREND_MAX_PERCENT}%`;
  return percentText(change, true);
}
