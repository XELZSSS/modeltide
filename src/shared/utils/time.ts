import { ONE_MINUTE } from "@/shared/config/time";
import { localeOf } from "@/shared/config/ui";
import type { Lang, TFunction } from "@/shared/i18n";
import { isFiniteNumber } from "./number";

// The single caller passes an explicit `lang` and never a clock, so both defaults were dead; the now is read inline.
export function formatRelativeTime(isoString: string, t: TFunction, lang: Lang): string {
  const nowMs = Date.now();
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const diffMs = nowMs - date.getTime();
  if (diffMs < -ONE_MINUTE) {
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

const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const UTC_DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  lang: string,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let formatter = cache.get(lang);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(localeOf(lang), options);
    cache.set(lang, formatter);
  }
  return formatter;
}

export function formatDate(isoString: string, lang: string): string {
  const input = isoString.trim();
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return isoString;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return dateFormatter(UTC_DATE_FORMATTERS, lang, { timeZone: "UTC" }).format(date);
  }
  return dateFormatter(DATE_FORMATTERS, lang).format(date);
}

/** A task duration: seconds once it passes one, milliseconds below that. Printed by the decision ranking's column and
 * its detail page alike, so the two cannot round the same run differently. */
export function formatDurationMs(ms: number | null | undefined, t: TFunction): string {
  if (!isFiniteNumber(ms)) return t("notAvailable");
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}
