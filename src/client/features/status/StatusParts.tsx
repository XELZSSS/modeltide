"use client";
import { memo, useMemo } from "react";
import { useTranslation } from "@/client/providers";
import type { DayBucket } from "@/shared/types";
import { cn } from "@/client/utils/cn";
import { ONE_DAY, UPTIME_ERROR_RATIO, UPTIME_WARN_RATIO } from "@/shared/config";

const BAR_THRESHOLDS = [
  { min: UPTIME_WARN_RATIO, className: "bg-success" },
  { min: UPTIME_ERROR_RATIO, className: "bg-warning" },
] as const;

function barClass(ratio: number | null): string {
  if (ratio == null) return "bg-bg-tertiary";
  return BAR_THRESHOLDS.find((band) => ratio >= band.min)?.className ?? "bg-destructive";
}

export const UptimeStrip = memo(function UptimeStrip({ buckets }: { buckets: DayBucket[] }) {
  const { t } = useTranslation();
  const byDay = useMemo(() => new Map(buckets.map((b) => [b.day, b])), [buckets]);
  const days = useMemo(() => {
    const out: string[] = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      out.push(new Date(now - i * ONE_DAY).toISOString().slice(0, 10));
    }
    return out;
  }, []);
  return (
    <div className="flex items-end gap-0.5 h-7" role="img" aria-label={t("last30Days")}>
      {days.map((day) => {
        const bucket = byDay.get(day);
        const ratio = bucket && bucket.total > 0 ? bucket.ok / bucket.total : null;
        const pct = ratio == null ? null : Math.round(ratio * 1000) / 10;
        return (
          <span
            key={day}
            className={cn("flex-1 h-full rounded-none", barClass(ratio))}
            title={
              bucket && pct != null ? `${bucket.day} · ${pct}% (${bucket.total})` : `${day} · ${t("uptimeNoData")}`
            }
          />
        );
      })}
    </div>
  );
});
