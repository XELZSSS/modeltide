import type { SourceHealthLevel, SourceHistorySummary } from "@/shared/types";

export function resolveLevel(summary: SourceHistorySummary | undefined | null): SourceHealthLevel {
  if (summary == null || summary.checkedAt == null) return "unknown";
  return summary.level ?? (summary.ok ? "ok" : "error");
}
