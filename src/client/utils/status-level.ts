import type { SourceHealthLevel, SourceHistorySummary } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";

/** Tri-level rendering map: dot color, text class and i18n label per health level. */
export const LEVEL_STYLES: Record<SourceHealthLevel, { dot: string; text: string; labelKey: TranslationKey }> = {
  ok: { dot: "var(--success)", text: "text-success", labelKey: "statusOnline" },
  warn: { dot: "var(--warning)", text: "text-warning", labelKey: "statusWarn" },
  error: { dot: "var(--destructive)", text: "text-destructive", labelKey: "statusOffline" },
  unknown: { dot: "var(--text-tertiary)", text: "text-text-secondary", labelKey: "uptimeNoData" },
};

/**
 * Runtime-safe health level: payloads rendered before the server added
 * `level` (stale caches) fall back to the ok boolean, unprobed stays unknown.
 */
export function resolveLevel(summary: SourceHistorySummary | undefined | null): SourceHealthLevel {
  if (summary == null || summary.checkedAt == null) return "unknown";
  return summary.level ?? (summary.ok ? "ok" : "error");
}
