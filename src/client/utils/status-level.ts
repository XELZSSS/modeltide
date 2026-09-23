import { UPTIME_ERROR_RATIO, UPTIME_WARN_RATIO } from "@/shared/config";
import type {
  DayBucket,
  SourceHealthLevel,
  SourceHistorySummary,
  SourceId,
  StatusHistoryPayload,
} from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";

export const LEVEL_STYLES: Record<SourceHealthLevel, { dot: string; text: string; labelKey: TranslationKey }> = {
  ok: { dot: "var(--success)", text: "text-success", labelKey: "statusOnline" },
  warn: { dot: "var(--warning)", text: "text-warning", labelKey: "statusWarn" },
  error: { dot: "var(--destructive)", text: "text-destructive", labelKey: "statusOffline" },
  unknown: { dot: "var(--text-tertiary)", text: "text-text-secondary", labelKey: "uptimeNoData" },
};

/** Payloads cached before the server added `level` fall back to the ok boolean. */
export function resolveLevel(summary: SourceHistorySummary | undefined | null): SourceHealthLevel {
  if (summary == null || summary.checkedAt == null) return "unknown";
  return summary.level ?? (summary.ok ? "ok" : "error");
}

/** Sources with a degraded sample in the payload's recent window (RECENT_WINDOW_MS). Read from
 *  `samples`, not `events`: that list is only the newest 50 across all sources. */
export function recentlyDegradedIds(recent: StatusHistoryPayload["recent"] | undefined): Set<SourceId> {
  const ids = new Set<SourceId>();
  for (const [id, samples] of Object.entries(recent ?? {})) {
    // Mirrors deriveEvents: degraded means the source is up but its provider reports an incident.
    if (samples?.some((s) => s.ok && s.warn === true)) ids.add(id as SourceId);
  }
  return ids;
}

/** Availability bands from `UPTIME_*`, plus one level for a day not fully healthy either. */
type DayBarLevel = "ok" | "degraded" | "warn" | "error" | "empty";

export const DAY_BAR_CLASSES: Record<DayBarLevel, string> = {
  ok: "bg-success",
  degraded: "bg-degraded",
  warn: "bg-warning",
  error: "bg-destructive",
  empty: "bg-bg-tertiary",
};

export function dayBarLevel(bucket: DayBucket | undefined): DayBarLevel {
  if (bucket == null || bucket.total <= 0) return "empty";
  const ratio = bucket.ok / bucket.total;
  // Down time outranks degradation: a day that dropped below a band shows the heavier signal.
  if (ratio < UPTIME_ERROR_RATIO) return "error";
  if (ratio < UPTIME_WARN_RATIO) return "warn";
  return (bucket.warn ?? 0) > 0 ? "degraded" : "ok";
}
