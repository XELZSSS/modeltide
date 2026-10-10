import type { SourceHealthLevel } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";

export const LEVEL_STYLES: Record<SourceHealthLevel, { dot: string; text: string; labelKey: TranslationKey }> = {
  ok: { dot: "var(--success)", text: "text-success", labelKey: "statusOnline" },
  warn: { dot: "var(--warning)", text: "text-warning", labelKey: "statusWarn" },
  error: { dot: "var(--destructive)", text: "text-destructive", labelKey: "statusOffline" },
  unknown: { dot: "var(--text-tertiary)", text: "text-text-secondary", labelKey: "uptimeNoData" },
};
