import { memo } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSuspenseStatusHistory } from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/shared";
import { PageContainer, PageHeader, PageSection } from "@/client/components/layout";
import { Card, CardContent, Dot } from "@/client/components/ui";
import { cn, formatRelativeTime, formatUptime } from "@/client/utils";
import { SOURCE_LABELS } from "@/shared/config";
import type { DayBucket, SourceHistorySummary, StatusEvent } from "@/shared/types";
import { UptimeStrip } from "./UptimeStrip";

function statusTextClass(ok: boolean): string {
  return ok ? "text-success" : "text-destructive";
}

const SourceCard = memo(function SourceCard({
  summary,
  buckets,
}: {
  summary: SourceHistorySummary;
  buckets: DayBucket[];
}) {
  const { t } = useTranslation();
  const label = t(SOURCE_LABELS[summary.id]);
  // No sample yet (fresh deploy): neutral "no data" instead of a false alarm.
  const unprobed = summary.checkedAt == null;
  return (
    <Link
      to={`/status/${summary.id}`}
      className="block rounded-xl border border-border bg-bg-card p-4 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Dot
            size="sm"
            color={unprobed ? "var(--text-tertiary)" : summary.ok ? "var(--success)" : "var(--destructive)"}
          />
          <span className="text-sm font-medium truncate">{label}</span>
        </div>
        <span className={cn("text-xs font-medium shrink-0", !unprobed && statusTextClass(summary.ok))}>
          {unprobed ? t("uptimeNoData") : t(summary.ok ? "statusOnline" : "statusOffline")}
        </span>
      </div>
      <UptimeStrip buckets={buckets} />
      <div className="flex items-center justify-between gap-2 mt-3 text-xs text-text-secondary">
        <span>
          {t("uptime24h")}
          <span className="font-mono text-text-primary ml-1">
            {summary.uptime24h == null ? t("uptimeNoData") : `${(summary.uptime24h * 100).toFixed(2)}%`}
          </span>
        </span>
        <span>
          {t("uptime7d")}
          <span className="font-mono text-text-primary ml-1">
            {summary.uptime7d == null ? t("uptimeNoData") : `${(summary.uptime7d * 100).toFixed(2)}%`}
          </span>
        </span>
        <ChevronRight size={14} className="shrink-0 text-text-tertiary" />
      </div>
    </Link>
  );
});

const EventRow = memo(function EventRow({ event }: { event: StatusEvent }) {
  const { t } = useTranslation();
  const down = event.type === "down";
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Dot size="sm" color={down ? "var(--destructive)" : "var(--success)"} />
        <span className="text-sm">
          <span className={cn("font-medium", statusTextClass(!down))}>{t(down ? "eventDown" : "eventUp")}</span>
          <span className="text-text-secondary mx-1.5">·</span>
          <span className="text-text-secondary">{t(SOURCE_LABELS[event.id])}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-text-secondary">
        {event.type === "down" && (
          <span className="font-mono">
            {event.durationMin == null ? t("eventOngoing") : t("eventDurationMin", { value: event.durationMin })}
          </span>
        )}
        <span>{formatRelativeTime(event.at, t)}</span>
      </div>
    </div>
  );
});

function StatusContent() {
  const { t } = useTranslation();
  const { data } = useSuspenseStatusHistory();
  const failing = data.sources.filter((s) => s.ok === false && s.checkedAt);
  const hasData = data.sources.some((s) => s.checkedAt != null);

  return (
    <PageContainer>
      <PageHeader title={t("statusPageTitle")} description={t("sourceStatus")} />

      <Card>
        <CardContent padding="md" className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Dot
              size="md"
              color={
                hasData ? (failing.length === 0 ? "var(--success)" : "var(--destructive)") : "var(--text-tertiary)"
              }
            />
            <p className="text-sm font-medium">
              {!hasData
                ? t("historyAccumulating")
                : failing.length === 0
                  ? t("statusAllOk")
                  : t("statusDegraded", { down: failing.length, total: data.sources.length })}
            </p>
          </div>
          <span className="text-xs text-text-secondary shrink-0">
            {t("serviceUptime")}
            <span className="font-mono text-text-primary ml-1.5">{formatUptime(t, data.uptimeMs)}</span>
          </span>
        </CardContent>
      </Card>

      <PageSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.sources.map((summary) => (
            <SourceCard key={summary.id} summary={summary} buckets={data.daily[summary.id] ?? []} />
          ))}
        </div>
      </PageSection>

      {hasData && (
        <PageSection title={t("recentEvents")}>
          {data.events.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("noRecentEvents")}</p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-bg-card">
              {data.events.slice(0, 15).map((event, i) => (
                <EventRow key={`${event.id}-${event.at}-${i}`} event={event} />
              ))}
            </div>
          )}
        </PageSection>
      )}
    </PageContainer>
  );
}

/** Data-source health dashboard: availability strips, latency and derived event timeline. */
export function StatusView() {
  return (
    <SuspenseQuery>
      <StatusContent />
    </SuspenseQuery>
  );
}
