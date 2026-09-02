import { memo } from "react";
import { useTranslation } from "@/client/providers";
import { Dot } from "@/client/components/ui";
import { cn, formatRelativeTime } from "@/client/utils";
import { SOURCE_LABELS } from "@/shared/config";
import type { StatusEvent } from "@/shared/types";

/** One availability event line: state dot + Down/Up label, optional source name and relative time. */
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
    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
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
