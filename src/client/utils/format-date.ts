import { ONE_MINUTE, ONE_HOUR, ONE_DAY, BENCHMARK_LABELS } from "@/shared/config";
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

export function formatDate(isoString: string | number | Date, lang: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  if (typeof isoString === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoString.trim())) {
    return date.toLocaleDateString(localeOf(lang), { timeZone: "UTC" });
  }
  return date.toLocaleDateString(localeOf(lang));
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
