import { memo } from "react";
import { useTranslation } from "@/client/providers";
import type { StatusEvent } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";
import { cn } from "@/client/utils/cn";
import { formatDurationMin, formatRelativeTime } from "@/client/utils/format";
import { sourceLabelKey } from "@/shared/config";
import { Dot } from "@/client/components/ui/primitives";
import { EmptyState } from "@/client/components/feedback";

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

const StatusEventRow = memo(function StatusEventRow({
  event,
  showSource = false,
  showTime = false,
}: {
  event: StatusEvent;
  showSource?: boolean;
  showTime?: boolean;
}) {
  const { t, lang } = useTranslation();
  const style = resolveEventStyle(event.type);
  const labelKey = sourceLabelKey(event.id);
  const sourceLabel = labelKey ? t(labelKey) : event.id;
  const detail = event.type === "up" ? null : (event.detail ?? null);
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="flex items-start gap-2 min-w-0">
        <Dot size="sm" color={style.color} className="mt-1.5" />
        <div className="min-w-0">
          <div className="text-sm">
            <span className={cn("font-medium", style.text)}>{t(style.labelKey)}</span>
            {showSource && (
              <>
                <span className="text-text-secondary mx-1.5">·</span>
                <span className="text-text-secondary">{sourceLabel}</span>
              </>
            )}
          </div>
          {detail && (
            <p className="ui-caption text-text-secondary mt-0.5 line-clamp-2 break-words" title={detail}>
              {detail}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-text-secondary">
        {event.type !== "up" && <span className="font-mono">{eventDurationLabel(t, event.durationMin)}</span>}
        {showTime && <span>{formatRelativeTime(event.at, t, lang)}</span>}
      </div>
    </div>
  );
});

export const StatusEventList = memo(function StatusEventList({
  events,
  emptyMessage,
  sourceId,
  limit,
  showSource = false,
  showTime = false,
}: {
  events: StatusEvent[];
  emptyMessage: string;
  sourceId?: string;
  limit?: number;
  showSource?: boolean;
  showTime?: boolean;
}) {
  const filtered = sourceId ? events.filter((event) => event.id === sourceId) : events;
  const visible = limit == null ? filtered : filtered.slice(0, limit);
  if (visible.length === 0) {
    return <EmptyState compact message={emptyMessage} />;
  }
  return (
    <div className="ui-card divide-y divide-border">
      {visible.map((event) => (
        <StatusEventRow
          key={`${event.id}-${event.at}-${event.type}`}
          event={event}
          showSource={showSource}
          showTime={showTime}
        />
      ))}
    </div>
  );
});
