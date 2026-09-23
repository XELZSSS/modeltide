import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/client/providers";
import type { DayBucket } from "@/shared/types";
import { cn } from "@/client/utils/cn";
import { ONE_DAY } from "@/shared/config";
import { DAY_BAR_CLASSES, dayBarLevel } from "@/client/utils/status-level";

function getLast30Days(now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = 29; i >= 0; i--) {
    out.push(new Date(now - i * ONE_DAY).toISOString().slice(0, 10));
  }
  return out;
}

export const UptimeStrip = memo(function UptimeStrip({ buckets }: { buckets: DayBucket[] }) {
  const { t } = useTranslation();
  const byDay = useMemo(() => new Map(buckets.map((b) => [b.day, b])), [buckets]);
  const [dayKey, setDayKey] = useState(() => Math.floor(Date.now() / ONE_DAY));
  useEffect(() => {
    const msUntilNextDay = (dayKey + 1) * ONE_DAY - Date.now();
    const timer = setTimeout(() => setDayKey(Math.floor(Date.now() / ONE_DAY)), msUntilNextDay + 1000);
    return () => clearTimeout(timer);
  }, [dayKey]);
  const days = useMemo(() => getLast30Days(dayKey * ONE_DAY), [dayKey]);
  return (
    <div className="flex items-end gap-0.5 h-7" role="img" aria-label={t("last30Days")}>
      {days.map((day) => {
        const bucket = byDay.get(day);
        const ratio = bucket && bucket.total > 0 ? bucket.ok / bucket.total : null;
        const pct = ratio == null ? null : Math.round(ratio * 1000) / 10;
        const degraded = bucket?.warn ?? 0;
        const title =
          bucket && pct != null
            ? [bucket.day, `${pct}% (${bucket.total})`, degraded > 0 ? t("dayDegraded", { count: degraded }) : null]
                .filter(Boolean)
                .join(" · ")
            : `${day} · ${t("uptimeNoData")}`;
        return <span key={day} className={cn("flex-1 h-full", DAY_BAR_CLASSES[dayBarLevel(bucket)])} title={title} />;
      })}
    </div>
  );
});
