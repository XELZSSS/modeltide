import type { TFunction } from "@/shared/i18n";

function usdString(v: number): string {
  if (Object.is(v, -0)) v = 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  let out = abs.toFixed(2);
  if (abs > 0 && Number(out) === 0) {
    out = abs.toFixed(3);
    if (Number(out) === 0) out = abs.toFixed(4);
    if (Number(out) === 0) return `${sign}<$0.0001`;
  }
  return `${sign}$${out}`;
}

export function formatDollar(v: number | null | undefined, t?: TFunction): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return t?.("notAvailable") ?? "N/A";
  return usdString(v);
}

export function formatPricePerMillion(v: number | null | undefined, t?: TFunction): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return t ? t("notAvailable") : "N/A";
  return `${usdString(v)}${t ? t("perMTokens") : "/M tokens"}`;
}
