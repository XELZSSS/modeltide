import { BENCHMARK_LABELS, ONE_MINUTE, ONE_HOUR, ONE_DAY } from "@/shared/config";
import type { Lang, TFunction, TranslationKey } from "@/shared/i18n";

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
  if (cleaned.startsWith("//") || cleaned.startsWith("/\\")) return undefined;
  if (cleaned.startsWith("/")) return cleaned;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return cleaned;
  } catch {
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
  return formatScaled(abs, sign, abs, SHORT_SCALES, 2) ?? `${sign}${abs}`;
}

export function formatTokens(n: number | null | undefined, t?: TFunction): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return t ? t("notAvailable") : "N/A";
  const { abs } = compactParts(n);
  const scaled = formatScaled(abs, "", n, TOKEN_SCALES, 1);
  if (scaled) {
    const [num, suffix] = [scaled.slice(0, -1), scaled.slice(-1)];
    const out = Number(num).toFixed(1);
    return `${out.endsWith(".0") ? out.slice(0, -2) : out}${suffix}`;
  }
  return String(n);
}

export function formatScore(t: TFunction, n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return t("notAvailable");
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

export function formatTrend(change?: number | null, t?: TFunction): string {
  if (typeof change !== "number" || !Number.isFinite(change)) return t ? t("notAvailable") : "N/A";
  if (change === 0) return "0.0%";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

const CAT_MAP: Record<string, TranslationKey> = {
  coding: "catCoding",
  reasoning: "catReasoning",
} as const satisfies Record<string, TranslationKey>;

export function categoryLabel(cat: string, t: TFunction): string {
  const mapped = Object.hasOwn(CAT_MAP, cat) ? CAT_MAP[cat] : undefined;
  return t(mapped ?? "catGeneral");
}

export function formatRelativeTime(isoString: string, t: TFunction, lang: Lang = "en"): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const diffMs = Date.now() - date.getTime();
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

export function formatDate(isoString: string | number | Date, lang: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  if (typeof isoString === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoString.trim())) {
    return date.toLocaleDateString(localeOf(lang), { timeZone: "UTC" });
  }
  return date.toLocaleDateString(localeOf(lang));
}
export function orNA(value: string | null | undefined, t: TFunction): string {
  return value || t("notAvailable");
}

export function benchmarkLabel(key: string, t: TFunction): string {
  const labelKey = Object.hasOwn(BENCHMARK_LABELS, key)
    ? (BENCHMARK_LABELS as Record<string, TranslationKey>)[key]
    : undefined;
  return labelKey ? t(labelKey) : key;
}

export function formatUptime(t: TFunction, ms: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return t("uptimeNoData");
  const days = Math.floor(ms / ONE_DAY);
  const hours = Math.floor((ms % ONE_DAY) / ONE_HOUR);
  const mins = Math.floor((ms % ONE_HOUR) / ONE_MINUTE);
  if (days > 0) return t("uptimeDays", { days, hours });
  if (hours > 0) return t("uptimeHours", { hours, mins });
  return t("uptimeMins", { mins });
}
