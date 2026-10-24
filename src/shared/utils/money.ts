import type { TFunction } from "@/shared/i18n";
import { isFiniteNumber } from "./number";
import { FALLBACK_NA } from "@/shared/config/ui";

function priceDisplayPrecision(v: number): number {
  const abs = Math.abs(v);
  if (abs === 0 || abs.toFixed(2) !== "0.00") return 2;
  return abs.toFixed(3) === "0.000" ? 4 : 3;
}

function usdString(v: number): string {
  const abs = Math.abs(v);
  const precision = priceDisplayPrecision(abs);
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
  if (!isFiniteNumber(v)) return t ? t("notAvailable") : FALLBACK_NA;
  return `${usdString(v)}${t ? t("perMTokens") : "/M tokens"}`;
}
