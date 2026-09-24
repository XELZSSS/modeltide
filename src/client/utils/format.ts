import { BENCHMARK_LABELS, ONE_DAY, ONE_HOUR, ONE_MINUTE } from "@/shared/config";
import type { Lang, TFunction, TranslationKey } from "@/shared/i18n";
import { isFiniteNumber } from "@/shared/utils";
import { isHttpUrl } from "@/shared/utils/url";
import { isProtocolRelative } from "@/client/utils/url";

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

export function formatShortNumber(n: number | null | undefined) {
  if (!isFiniteNumber(n)) return "—";
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

export function formatSpeed(v: number | null | undefined, t: TFunction): string {
  return isFiniteNumber(v) ? formatIndex(v) : t("notAvailable");
}

const INDEX_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatIndex(v: number): string {
  if (!isFiniteNumber(v)) return "—";
  return INDEX_FORMATTER.format(v);
}

export function formatTrend(change?: number | null, t?: TFunction): string {
  if (!isFiniteNumber(change)) return t ? t("notAvailable") : "N/A";
  if (change === 0) return "0.0%";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

export function formatBoolean(value: boolean | null | undefined, t: TFunction) {
  if (value === true) return t("yes");
  if (value === false) return t("no");
  return t("notAvailable");
}

export function orNA(value: string | null | undefined, t: TFunction): string {
  return value || t("notAvailable");
}

export function priceDisplayPrecision(v: number): number {
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

function stripControlChars(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0xfeff) continue;
    out += s.charAt(i);
  }
  return out;
}

export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const cleaned = stripControlChars(url);
  if (!cleaned) return undefined;
  if (isProtocolRelative(cleaned)) return undefined;
  if (cleaned.startsWith("/")) return cleaned;
  return isHttpUrl(cleaned) ? cleaned : undefined;
}

const CAT_MAP: Record<string, TranslationKey> = {
  coding: "catCoding",
  reasoning: "catReasoning",
} as const satisfies Record<string, TranslationKey>;

export function categoryLabel(cat: string, t: TFunction): string {
  const mapped = Object.hasOwn(CAT_MAP, cat) ? CAT_MAP[cat] : undefined;
  return t(mapped ?? "catGeneral");
}

export function formatRelativeTime(isoString: string, t: TFunction, lang: Lang = "en", nowMs = Date.now()): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const diffMs = nowMs - date.getTime();
  if (diffMs < -60_000) {
    return formatDate(isoString, lang);
  }
  if (diffMs < 0) return t("timeJustNow");
  const diffMins = Math.floor(diffMs / ONE_MINUTE);
  if (diffMins < 1) return t("timeJustNow");
  if (diffMins < 60) return t("timeMinutesAgo", { value: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t("timeHoursAgo", { value: diffHours });
  return t("timeDaysAgo", { value: Math.floor(diffHours / 24) });
}

function localeOf(lang: string): string {
  return lang === "zh" ? "zh-CN" : "en-US";
}

const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const UTC_DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(cache: Map<string, Intl.DateTimeFormat>, lang: string, timeZone?: "UTC"): Intl.DateTimeFormat {
  let formatter = cache.get(lang);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(localeOf(lang), timeZone ? { timeZone } : undefined);
    cache.set(lang, formatter);
  }
  return formatter;
}

export function formatDate(isoString: string | number | Date, lang: string): string {
  const input = typeof isoString === "string" ? isoString.trim() : isoString;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(isoString);
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return dateFormatter(UTC_DATE_FORMATTERS, lang, "UTC").format(date);
  }
  return dateFormatter(DATE_FORMATTERS, lang).format(date);
}

export function benchmarkLabel(key: string, t: TFunction): string {
  const labelKey = Object.hasOwn(BENCHMARK_LABELS, key)
    ? (BENCHMARK_LABELS as Record<string, TranslationKey>)[key]
    : undefined;
  return labelKey ? t(labelKey) : key;
}

export function formatUptime(ms: number, t: TFunction): string {
  if (!isFiniteNumber(ms) || ms < 0) return t("uptimeNoData");
  const days = Math.floor(ms / ONE_DAY);
  const hours = Math.floor((ms % ONE_DAY) / ONE_HOUR);
  const mins = Math.floor((ms % ONE_HOUR) / ONE_MINUTE);
  if (days > 0) return t("uptimeDays", { days, hours });
  if (hours > 0) return t("uptimeHours", { hours, mins });
  return t("uptimeMins", { mins });
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export function formatDurationMin(minutes: number, t: TFunction): string {
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  if (days > 0) return t("eventDurationDays", { days, hours });
  if (hours > 0) return t("eventDurationHours", { hours, mins: Math.floor(minutes % MINUTES_PER_HOUR) });
  return t("eventDurationMin", { value: minutes });
}
