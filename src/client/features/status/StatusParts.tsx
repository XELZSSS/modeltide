import { memo, useMemo } from "react";
import { useTranslation } from "@/client/providers";
import type { DayBucket, StatusEvent } from "@/shared/types";
import { cn, formatRelativeTime } from "@/client/utils";
import { ONE_DAY, SOURCE_LABELS } from "@/shared/config";
import { Dot } from "@/client/components/ui";

// ---- UptimeStrip ----
/** Bar color by daily uptime. */
function barClass(ratio: number | null): string {
  if (ratio == null) return "bg-bg-tertiary";
  if (ratio >= 0.995) return "bg-success";
  if (ratio >= 0.95) return "bg-warning";
  return "bg-destructive";
}

/** Availability strip: one micro-bar per UTC day, 90 slots ending today. */
export const UptimeStrip = memo(function UptimeStrip({ buckets }: { buckets: DayBucket[] }) {
  const { t } = useTranslation();
  const byDay = useMemo(() => new Map(buckets.map((b) => [b.day, b])), [buckets]);
  // Day-granular key: the window only changes at midnight.
  const dayKey = new Date(Date.now()).toISOString().slice(0, 10);
  const days = useMemo(() => {
    const out: string[] = [];
    const now = Date.now();
    for (let i = 89; i >= 0; i--) {
      out.push(new Date(now - i * ONE_DAY).toISOString().slice(0, 10));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);
  return (
    <div className="flex items-end gap-0.5 h-7" role="img" aria-label={t("last90Days")}>
      {days.map((day) => {
        const bucket = byDay.get(day);
        const ratio = bucket && bucket.total > 0 ? bucket.ok / bucket.total : null;
        const pct = ratio == null ? null : Math.round(ratio * 1000) / 10;
        return (
          <span
            key={day}
            className={cn("flex-1 h-full rounded-sm", barClass(ratio))}
            title={
              bucket && pct != null ? `${bucket.day} · ${pct}% (${bucket.total})` : `${day} · ${t("uptimeNoData")}`
            }
          />
        );
      })}
    </div>
  );
});

// ---- StatusEventRow ----
/** Event timeline: empty hint or a divided card list. */
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
      {events.map((event) => (
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

/** One event line: state dot + Down/Up label, optional source and time. */
export const StatusEventRow = memo(function StatusEventRow({
  event,
  showSource = false,
  showTime = false,
}: {
  event: StatusEvent;
  showSource?: boolean;
  showTime?: boolean;
}) {
  const { t } = useTranslation();
  const down = event.type === "down";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <Dot size="sm" color={down ? "var(--destructive)" : "var(--success)"} />
        <span className="text-sm">
          <span className={cn("font-medium", down ? "text-destructive" : "text-success")}>
            {t(down ? "eventDown" : "eventUp")}
          </span>
          {showSource && (
            <>
              <span className="text-text-secondary mx-1.5">·</span>
              <span className="text-text-secondary">{t(SOURCE_LABELS[event.id])}</span>
            </>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-text-secondary">
        {down && (
          <span className="font-mono">
            {event.durationMin == null ? t("eventOngoing") : t("eventDurationMin", { value: event.durationMin })}
          </span>
        )}
        {showTime && <span>{formatRelativeTime(event.at, t)}</span>}
      </div>
    </div>
  );
});
