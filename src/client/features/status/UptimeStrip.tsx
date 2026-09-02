import { memo } from "react";
import { useTranslation } from "@/client/providers";
import type { DayBucket } from "@/shared/types";
import { cn } from "@/client/utils";
import { ONE_DAY } from "@/shared/config";

/** Bar color by daily uptime: healthy / degraded / failing / no data. */
function barClass(ratio: number | null): string {
  if (ratio == null) return "bg-bg-tertiary";
  if (ratio >= 0.995) return "bg-success";
  if (ratio >= 0.95) return "bg-warning";
  return "bg-destructive";
}

/** GitHub-style availability strip: one micro-bar per UTC day, exactly 90 slots ending today. */
export const UptimeStrip = memo(function UptimeStrip({ buckets }: { buckets: DayBucket[] }) {
  const { t } = useTranslation();
  const byDay = new Map(buckets.map((b) => [b.day, b]));
  const days: string[] = [];
  const now = Date.now();
  for (let i = 89; i >= 0; i--) {
    days.push(new Date(now - i * ONE_DAY).toISOString().slice(0, 10));
  }
  return (
    <div className="flex items-end gap-px h-7" role="img" aria-label={t("last90Days")}>
      {days.map((day) => {
        const bucket = byDay.get(day);
        const ratio = bucket && bucket.total > 0 ? bucket.ok / bucket.total : null;
        const pct = ratio == null ? null : Math.round(ratio * 1000) / 10;
        return (
          <span
            key={day}
            className={cn("flex-1 h-full rounded-[1px]", barClass(ratio))}
            title={
              bucket && pct != null ? `${bucket.day} · ${pct}% (${bucket.total})` : `${day} · ${t("uptimeNoData")}`
            }
          />
        );
      })}
    </div>
  );
});
