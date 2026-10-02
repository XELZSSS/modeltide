import type { TFunction } from "@/shared/i18n";
import { isFiniteNumber } from "@/shared/utils";

function priceDisplayPrecision(v: number): number {
  const abs = Math.abs(v);
  if (abs === 0 || abs.toFixed(2) !== "0.00") return 2;
  return abs.toFixed(3) === "0.000" ? 4 : 3;
}

function usdString(v: number): string {
  if (Object.is(v, -0)) v = 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const out = abs.toFixed(priceDisplayPrecision(abs));
  if (abs > 0 && Number(out) === 0) return `${sign}<$0.0001`;
  return `${sign}$${out}`;
}

export function formatDollar(v: number | null | undefined, t?: TFunction): string {
  if (!isFiniteNumber(v)) return t?.("notAvailable") ?? "N/A";
  return usdString(v);
}

export function formatPricePerMillion(v: number | null | undefined, t?: TFunction): string {
  if (!isFiniteNumber(v)) return t ? t("notAvailable") : "N/A";
  return `${usdString(v)}${t ? t("perMTokens") : "/M tokens"}`;
}
