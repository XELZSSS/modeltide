"use client";
import { memo } from "react";
import { useTranslation } from "@/client/providers";
import type { StatusEvent } from "@/shared/types";
import { cn } from "@/client/utils/cn";
import { formatRelativeTime } from "@/client/utils/format";
import { SOURCE_LABELS } from "@/shared/config";
import { Dot } from "@/client/components/ui/primitives";

const EVENT_STYLES = {
  down: { color: "var(--destructive)", text: "text-destructive", labelKey: "eventDown" },
  degraded: { color: "var(--warning)", text: "text-warning", labelKey: "eventDegraded" },
  up: { color: "var(--success)", text: "text-success", labelKey: "eventUp" },
} as const;

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
  const style = EVENT_STYLES[event.type];
  const labelKey = Object.hasOwn(SOURCE_LABELS, event.id)
    ? (SOURCE_LABELS as Record<string, (typeof SOURCE_LABELS)[keyof typeof SOURCE_LABELS]>)[event.id]
    : undefined;
  const sourceLabel = labelKey ? t(labelKey) : event.id;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <Dot size="sm" color={style.color} />
        <span className="text-sm">
          <span className={cn("font-medium", style.text)}>{t(style.labelKey)}</span>
          {showSource && (
            <>
              <span className="text-text-secondary mx-1.5">·</span>
              <span className="text-text-secondary">{sourceLabel}</span>
            </>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-text-secondary">
        {event.type !== "up" && (
          <span className="font-mono">
            {event.durationMin == null ? t("eventOngoing") : t("eventDurationMin", { value: event.durationMin })}
          </span>
        )}
        {showTime && <span>{formatRelativeTime(event.at, t, lang)}</span>}
      </div>
    </div>
  );
});

export const StatusEventList = memo(function StatusEventList({
  events,
  emptyMessage,
  showSource = false,
  showTime = false,
}: {
  events: StatusEvent[];
  emptyMessage: string;
  showSource?: boolean;
  showTime?: boolean;
}) {
  if (events.length === 0) {
    return <p className="ui-body-secondary">{emptyMessage}</p>;
  }
  return (
    <div className="divide-y divide-border border border-border bg-bg-card">
      {events.map((event, idx) => (
        <StatusEventRow
          key={`${event.id}-${event.at}-${event.type}-${idx}`}
          event={event}
          showSource={showSource}
          showTime={showTime}
        />
      ))}
    </div>
  );
});
