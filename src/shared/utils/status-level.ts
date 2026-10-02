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

export function resolveLevel(summary: SourceHistorySummary | undefined | null): SourceHealthLevel {
  if (summary == null || summary.checkedAt == null) return "unknown";
  return summary.level ?? (summary.ok ? "ok" : "error");
}

export function recentlyDegradedIds(recent: StatusHistoryPayload["recent"] | undefined): Set<SourceId> {
  const ids = new Set<SourceId>();
  for (const [id, samples] of Object.entries(recent ?? {})) {
    if (samples?.some((s) => s.ok && s.warn === true)) ids.add(id as SourceId);
  }
  return ids;
}

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
  if (ratio < UPTIME_ERROR_RATIO) return "error";
  if (ratio < UPTIME_WARN_RATIO) return "warn";
  return (bucket.warn ?? 0) > 0 ? "degraded" : "ok";
}
