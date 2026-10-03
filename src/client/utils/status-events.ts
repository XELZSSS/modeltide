import type { TFunction } from "@/shared/i18n";
import { formatDurationMin } from "@/client/utils/format";

const EVENT_STYLES = {
  down: { color: "var(--destructive)", text: "text-destructive", labelKey: "eventDown" },
  degraded: { color: "var(--warning)", text: "text-warning", labelKey: "eventDegraded" },
  up: { color: "var(--success)", text: "text-success", labelKey: "eventUp" },
} as const;

type EventType = keyof typeof EVENT_STYLES;

export function resolveEventStyle(type: string): (typeof EVENT_STYLES)[EventType] {
  return Object.hasOwn(EVENT_STYLES, type) ? EVENT_STYLES[type as EventType] : EVENT_STYLES.up;
}

export function eventDurationLabel(t: TFunction, durationMin: number | null): string {
  return durationMin == null ? t("eventOngoing") : formatDurationMin(durationMin, t);
}
