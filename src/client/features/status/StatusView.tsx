"use client";
import { memo } from "react";
import { SafeLink as Link } from "@/client/router";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSuspenseStatusHistory } from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/feedback";
import { PageContainer, PageHeader, PageSection } from "@/client/components/layout";
import { Card, CardContent } from "@/client/components/ui/card";
import { Dot } from "@/client/components/ui/primitives";
import { cn } from "@/client/utils/cn";
import { formatUptime, formatUptimePct } from "@/client/utils/format";
import { SOURCE_LABELS } from "@/shared/config";
import type { DayBucket, SourceHistorySummary } from "@/shared/types";
import { LEVEL_STYLES, resolveLevel } from "@/client/utils/status-level";
import { UptimeStrip } from "./StatusParts";
import { StatusEventList } from "@/client/components/status-events";

const EMPTY_BUCKETS: DayBucket[] = [];

const SourceCard = memo(function SourceCard({
  summary,
  buckets,
}: {
  summary: SourceHistorySummary;
  buckets: DayBucket[];
}) {
  const { t } = useTranslation();
  const label = t(SOURCE_LABELS[summary.id]);
  const level = resolveLevel(summary);
  const style = LEVEL_STYLES[level];
  return (
    <Link
      href={`/status/${summary.id}`}
      className="block border border-border bg-bg-card p-4 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Dot size="sm" color={style.dot} />
          <span className="text-sm font-medium truncate">{label}</span>
        </div>
        <span className={cn("text-xs font-medium shrink-0", style.text)}>{t(style.labelKey)}</span>
      </div>
      <UptimeStrip buckets={buckets} />
      <div className="flex items-center justify-between gap-3 mt-3 ui-caption">
        {(
          [
            ["uptime24h", summary.uptime24h],
            ["uptime7d", summary.uptime7d],
          ] as const
        ).map(([labelKey, value]) => (
          <span key={labelKey}>
            {t(labelKey)}
            <span className="font-mono text-text-primary ml-1.5">{formatUptimePct(t, value)}</span>
          </span>
        ))}
        <ChevronRight size={16} className="shrink-0 text-text-tertiary" />
      </div>
    </Link>
  );
});

function StatusContent() {
  const { t } = useTranslation();
  const { data } = useSuspenseStatusHistory();
  const levels = data.sources.map((s) => resolveLevel(s));
  const erroring = levels.filter((l) => l === "error").length;
  const warning = levels.filter((l) => l === "warn").length;
  const hasData = data.sources.some((s) => s.checkedAt != null);
  // Unprobed sources must not read as healthy: with 1 probed-OK + 13 silent
  // the header would otherwise claim "all operational".
  const unprobed = levels.filter((l) => l === "unknown").length;

  return (
    <PageContainer>
      <PageHeader title={t("statusPageTitle")} description={t("sourceStatus")} />

      {data.persisted === false && (
        <Card>
          <CardContent>
            <p className="text-xs text-text-secondary">{t("memoryModeNotice")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Dot
              size="md"
              color={
                !hasData
                  ? "var(--text-tertiary)"
                  : erroring > 0
                    ? "var(--destructive)"
                    : warning > 0
                      ? "var(--warning)"
                      : unprobed > 0
                        ? "var(--text-tertiary)"
                        : "var(--success)"
              }
            />
            <p className="text-sm font-medium">
              {!hasData
                ? t("historyAccumulating")
                : erroring > 0
                  ? t("statusDegraded", { down: erroring, total: data.sources.length })
                  : warning > 0
                    ? t("statusWarnBanner", { warn: warning, total: data.sources.length })
                    : unprobed > 0
                      ? t("statusProbing", { probed: data.sources.length - unprobed, total: data.sources.length })
                      : t("statusAllOk")}
            </p>
          </div>
          <span className="text-xs text-text-secondary shrink-0">
            {t("serviceUptime")}
            <span className="font-mono text-text-primary ml-1.5">{formatUptime(t, data.uptimeMs)}</span>
          </span>
        </CardContent>
      </Card>

      <PageSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {data.sources.map((summary) => (
            <SourceCard key={summary.id} summary={summary} buckets={data.daily[summary.id] ?? EMPTY_BUCKETS} />
          ))}
        </div>
      </PageSection>

      {hasData && (
        <PageSection title={t("recentEvents")}>
          <StatusEventList
            events={(data.events ?? []).slice(0, 15)}
            emptyMessage={t("noRecentEvents")}
            showSource
            showTime
          />
        </PageSection>
      )}
    </PageContainer>
  );
}

export function StatusView() {
  return (
    <SuspenseQuery>
      <StatusContent />
    </SuspenseQuery>
  );
}
