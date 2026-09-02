import { BENCHMARK_LABELS, ONE_MINUTE, ONE_HOUR, ONE_DAY } from "@/shared/config";
import type { TFunction, TranslationKey } from "@/shared/i18n";

export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return trimmed;
  } catch (e) {
    console.warn("[format] invalid URL:", e);
    return undefined;
  }
  return undefined;
}

export function formatBoolean(t: TFunction, value?: boolean | null) {
  if (value === true) return t("yes");
  if (value === false) return t("no");
  return t("notAvailable");
}

function compactParts(n: number) {
  const abs = Math.abs(n);
  return { abs, k: abs / 1e3, m: abs / 1e6, b: abs / 1e9, t: abs / 1e12, sign: n < 0 ? "-" : "" };
}

// Threshold where rounding promotes to the next unit: 1000 - 0.5 * 10^-decimals
const PROMOTE_2DEC = 999.995; // for toFixed(2)
const PROMOTE_1DEC = 999.95; // for toFixed(1)

const strip1Dec = (v: number, suffix: string) => {
  const out = v.toFixed(1);
  return `${out.endsWith(".0") ? out.slice(0, -2) : out}${suffix}`;
};

export function formatShortNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  const { abs, k, m, b, t, sign } = compactParts(n);
  if (b >= PROMOTE_2DEC) return `${sign}${t.toFixed(2)}T`;
  if (m >= PROMOTE_2DEC) return `${sign}${b.toFixed(2)}B`;
  if (k >= PROMOTE_2DEC) return `${sign}${m.toFixed(2)}M`;
  if (k >= 1) return `${sign}${k.toFixed(2)}K`;
  return `${sign}${abs}`;
}

export function formatTokens(n: number | null | undefined, t?: TFunction): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return t ? t("notAvailable") : "N/A";
  const { k, m } = compactParts(n);
  if (m >= PROMOTE_1DEC) return strip1Dec(n / 1e9, "B");
  if (k >= PROMOTE_1DEC) return strip1Dec(m, "M");
  if (k >= 1) return strip1Dec(k, "K");
  return String(n);
}

export function formatScore(t: TFunction, n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return t("notAvailable");
  return n.toFixed(2);
}

/** Percent with one decimal; null/undefined falls back to the localized "N/A". */
export function formatPercent(t: TFunction, v: number | null | undefined): string {
  return v == null ? t("notAvailable") : `${v.toFixed(1)}%`;
}

/** Uptime ratio in [0,1] rendered as a two-decimal percentage; null falls back to the localized "no data". */
export function formatUptimePct(t: TFunction, v: number | null | undefined): string {
  return v == null ? t("uptimeNoData") : `${(v * 100).toFixed(2)}%`;
}

/** Output speed in tokens/s at one decimal with digit grouping; null falls back to the localized "N/A". */
export function formatSpeed(t: TFunction, v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? formatIndex(v) : t("notAvailable");
}

/** Number at one decimal with digit grouping (speeds, index values). */
export function formatIndex(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function usdString(v: number): string {
  let out = v.toFixed(2);
  if (v > 0 && Number(out) === 0) {
    out = v.toFixed(3);
    if (Number(out) === 0) out = v.toFixed(4);
  }
  return `$${out}`;
}

export function formatDollar(v: number | null | undefined, t?: TFunction): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return t?.("notAvailable") ?? "N/A";
  return usdString(v);
}

export function formatPricePerMillion(v: number | null | undefined, t?: TFunction): string {
  if (typeof v === "number") return `${usdString(v)}${t ? t("perMTokens") : "/M tokens"}`;
  return t ? t("notAvailable") : "N/A";
}

export function formatTrend(change?: number | null, t?: TFunction): string {
  if (change == null) return t ? t("notAvailable") : "N/A";
  if (change === 0) return "0.0%";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

const CAT_MAP: Record<string, TranslationKey> = {
  coding: "catCoding",
  reasoning: "catReasoning",
} as const satisfies Record<string, TranslationKey>;

export function categoryLabel(cat: string, t: TFunction): string {
  return t(CAT_MAP[cat] ?? "catGeneral");
}

export function formatRelativeTime(isoString: string, t: TFunction): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return t("timeJustNow");
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return t("timeJustNow");
  if (diffMins < 60) return t("timeMinutesAgo", { value: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t("timeHoursAgo", { value: diffHours });
  return t("timeDaysAgo", { value: Math.floor(diffHours / 24) });
}

function localeOf(lang: string): string {
  return lang === "zh" ? "zh-CN" : "en-US";
}

export function formatDate(isoString: string | number | Date, lang: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return String(isoString);
  return date.toLocaleDateString(localeOf(lang), { timeZone: "UTC" });
}

export function orNA(value: string | null | undefined, t: TFunction): string {
  return value || t("notAvailable");
}

export function benchmarkLabel(key: string, t: TFunction): string {
  const labelKey = (BENCHMARK_LABELS as Record<string, TranslationKey>)[key];
  return labelKey ? t(labelKey) : key;
}

export function formatUptime(t: TFunction, ms: number): string {
  const days = Math.floor(ms / ONE_DAY);
  const hours = Math.floor((ms % ONE_DAY) / ONE_HOUR);
  const mins = Math.floor((ms % ONE_HOUR) / ONE_MINUTE);
  if (days > 0) return t("uptimeDays", { days, hours });
  if (hours > 0) return t("uptimeHours", { hours, mins });
  return t("uptimeMins", { mins });
}
