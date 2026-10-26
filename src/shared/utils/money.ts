import type { TFunction } from "@/shared/i18n";
import { isFiniteNumber } from "./number";
import { FALLBACK_NA } from "@/shared/config/ui";

/**
 * Price precision by magnitude, never by trial: probing with `toFixed(2)` first made 0.0075 pass the two-decimal test
 * (it rounds to "0.01") and then fall through to the smallest-printable bound, so a $0.0075 model printed "<$0.01"
 * while the cheaper $0.0049 model printed "$0.005" — the pricier row read as the cheaper one.
 *
 * Takes the magnitude: the one caller has `Math.abs` in hand already.
 */
function priceDisplayPrecision(abs: number): number {
  if (abs === 0 || abs >= 0.01) return 2;
  return abs >= 0.001 ? 3 : 4;
}

/** Above this, `toFixed` switches to exponential notation and prints "$3.7e+301" for a monthly cost. */
const MAX_PLAIN_DOLLARS = 1e15;

function usdString(v: number): string {
  const abs = Math.abs(v);
  const precision = priceDisplayPrecision(abs);
  // `toFixed` gives up on plain decimal notation past 1e21, and a hand-edited scenario can reach it: a "$3.7e+301"
  // figure is not an amount anyone reads, so an out-of-range value reports its bound the way a sub-cent one does.
  if (abs >= MAX_PLAIN_DOLLARS) return v < 0 ? ">-$1e15" : ">$1e15";
  const out = abs.toFixed(precision);
  // Below the smallest printable amount, rounding would invent a value the price does not have: report the bound
  // (">-$0.0001" / "<$0.0001") instead of a made-up one.
  if (abs > 0 && abs < 10 ** -precision) {
    const bound = (10 ** -precision).toFixed(precision);
    return v < 0 ? `>-$${bound}` : `<$${bound}`;
  }
  return `${v < 0 ? "-" : ""}$${out}`;
}

export function formatDollar(v: number | null | undefined, t?: TFunction): string {
  if (!isFiniteNumber(v)) return t?.("notAvailable") ?? FALLBACK_NA;
  return usdString(v);
}

export function formatPricePerMillion(v: number | null | undefined, t?: TFunction): string {
  // A missing price reports the same fallback `formatDollar` prints, without a per-million suffix to attach it to.
  if (!isFiniteNumber(v)) return formatDollar(v, t);
  return `${usdString(v)}${t ? t("perMTokens") : "/M tokens"}`;
}
