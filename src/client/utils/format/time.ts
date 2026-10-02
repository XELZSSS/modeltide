import { ONE_DAY, ONE_HOUR, ONE_MINUTE } from "@/shared/config";
import type { Lang, TFunction } from "@/shared/i18n";
import { isFiniteNumber } from "@/shared/utils";

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

const TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

export function formatTime(value: number | string | Date, lang: string): string {
  let formatter = TIME_FORMATTERS.get(lang);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(localeOf(lang), { hour: "2-digit", minute: "2-digit" });
    TIME_FORMATTERS.set(lang, formatter);
  }
  return formatter.format(new Date(value));
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
