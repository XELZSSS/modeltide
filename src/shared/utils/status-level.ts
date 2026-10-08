import { UPTIME_ERROR_RATIO, UPTIME_WARN_RATIO } from "@/shared/config";
import type {
  SourceHealthLevel,
  SourceHistorySummary,
  SourceId,
  StatusHistoryPayload,
} from "@/shared/types";

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

export function dayBarLevel(
  bucket: { total: number; ok: number; warn?: number | null } | undefined,
): DayBarLevel {
  if (bucket == null || bucket.total <= 0) return "empty";
  const ratio = bucket.ok / bucket.total;
  if (ratio < UPTIME_ERROR_RATIO) return "error";
  if (ratio < UPTIME_WARN_RATIO) return "warn";
  return (bucket.warn ?? 0) > 0 ? "degraded" : "ok";
}
