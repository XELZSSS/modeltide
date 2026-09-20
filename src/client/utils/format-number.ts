import type { TFunction } from "@/shared/i18n";

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

export function formatShortNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  const { abs, sign } = compactParts(n);
  const scaled = formatScaled(abs, sign, abs, SHORT_SCALES, 2);
  if (scaled) return scaled;
  if (Number.isInteger(abs)) return `${sign}${abs}`;
  return `${sign}${parseFloat(abs.toFixed(2))}`;
}

export function formatTokens(n: number | null | undefined, t?: TFunction): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return t ? t("notAvailable") : "N/A";
  const { abs } = compactParts(n);
  const scaled = formatScaled(abs, "", n, TOKEN_SCALES, 1);
  if (scaled) {
    const [num, suffix] = [scaled.slice(0, -1), scaled.slice(-1)];
    return `${num.endsWith(".0") ? num.slice(0, -2) : num}${suffix}`;
  }
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(1)));
}

export function formatScore(t: TFunction, n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return t("notAvailable");
  if (Math.abs(n) > 1_000_000) return t("notAvailable");
  return n.toFixed(2);
}

export function formatPercent(t: TFunction, v: number | null | undefined): string {
  return typeof v !== "number" || !Number.isFinite(v) ? t("notAvailable") : `${v.toFixed(1)}%`;
}

export function formatUptimePct(t: TFunction, v: number | null | undefined): string {
  return typeof v !== "number" || !Number.isFinite(v) ? t("uptimeNoData") : `${(v * 100).toFixed(2)}%`;
}

export function formatSpeed(t: TFunction, v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? formatIndex(v) : t("notAvailable");
}

export function formatIndex(v: number): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatTrend(change?: number | null, t?: TFunction): string {
  if (typeof change !== "number" || !Number.isFinite(change)) return t ? t("notAvailable") : "N/A";
  if (change === 0) return "0.0%";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

export function formatBoolean(t: TFunction, value?: boolean | null) {
  if (value === true) return t("yes");
  if (value === false) return t("no");
  return t("notAvailable");
}

export function orNA(value: string | null | undefined, t: TFunction): string {
  return value || t("notAvailable");
}
