import { memo } from "react";
import { SafeLink as Link } from "@/client/router";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSuspenseStatusHistory } from "@/client/api/api-queries";
import { PartialNotice, SuspenseQuery } from "@/client/components/feedback";
import { PageContainer, PageHeader, PageSection } from "@/client/components/layout";
import { Card, CardContent } from "@/client/components/ui/card";
import { Dot, LabeledDot } from "@/client/components/ui/primitives";
import { cn } from "@/client/utils/cn";
import { formatUptime, formatUptimePct } from "@/client/utils/format";
import { sourceLabelKey } from "@/shared/config";
import type { DayBucket, SourceHistorySummary } from "@/shared/types";
import { LEVEL_STYLES, recentlyDegradedIds, resolveLevel } from "@/client/utils/status-level";
import { UptimeStrip } from "./status-parts";
import { StatusEventList } from "./status-events";

const EMPTY_BUCKETS: DayBucket[] = [];

const SourceCard = memo(function SourceCard({
  summary,
  buckets,
  recentlyDegraded,
}: {
  summary: SourceHistorySummary;
  buckets: DayBucket[];
  recentlyDegraded: boolean;
}) {
  const { t } = useTranslation();
  const labelKey = sourceLabelKey(summary.id);
  const label = labelKey ? t(labelKey) : summary.id;
  const level = resolveLevel(summary);
  const style = LEVEL_STYLES[level];
  // The card used to say only "Degraded" / "Failure"; the source's own warning or
  // probe error is what tells the reader whether it matters.
  const detail = level === "ok" ? null : (summary.detail ?? null);
  return (
    <Link
      href={`/status/${summary.id}`}
      className="group block ui-card p-4 transition-colors duration-fast hoverable:hover:border-text-tertiary/40 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <LabeledDot size="sm" color={style.dot} textClassName="ui-body" className="flex-1">
          {label}
        </LabeledDot>
        <div className="shrink-0 text-right">
          <span className={cn("ui-caption font-medium", style.text)}>{t(style.labelKey)}</span>
          {recentlyDegraded && level === "ok" && (
            <div className="ui-caption text-warning mt-0.5">{t("degradedRecently")}</div>
          )}
        </div>
      </div>
      {detail && (
        <p className="ui-caption text-text-secondary mb-2 line-clamp-2 break-words" title={detail}>
          {detail}
        </p>
      )}
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
            <span className="ui-mono-value text-xs text-text-primary ml-1.5">{formatUptimePct(t, value)}</span>
          </span>
        ))}
        <ChevronRight
          size={16}
          className="shrink-0 text-text-tertiary transition-transform duration-fast group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
});

function StatusContent() {
  const { t } = useTranslation();
  const { data } = useSuspenseStatusHistory();
  const levels = data.sources.map((s) => resolveLevel(s));
  const degradedIds = recentlyDegradedIds(data.events ?? []);
  const erroring = levels.filter((l) => l === "error").length;
  const warning = levels.filter((l) => l === "warn").length;
  const hasData = data.sources.some((s) => s.checkedAt != null);
  // Unprobed sources must not read as healthy (1 probed-OK + 13 silent).
  const unprobed = levels.filter((l) => l === "unknown").length;
  const sourceCount = data.sources.length;
  // Priority order: no data > errors > warnings > still probing > all ok.
  let overall: { color: string; message: string };
  if (!hasData) overall = { color: "var(--text-tertiary)", message: t("historyAccumulating") };
  else if (erroring > 0)
    overall = { color: "var(--destructive)", message: t("statusDegraded", { down: erroring, total: sourceCount }) };
  else if (warning > 0)
    overall = { color: "var(--warning)", message: t("statusWarnBanner", { warn: warning, total: sourceCount }) };
  else if (unprobed > 0)
    overall = {
      color: "var(--text-tertiary)",
      message: t("statusProbing", { probed: sourceCount - unprobed, total: sourceCount }),
    };
  else overall = { color: "var(--success)", message: t("statusAllOk") };

  return (
    <PageContainer>
      <PageHeader title={t("statusPageTitle")} kicker={t("kickerStatus")} description={t("sourceStatus")} />

      {data.persisted === false && <PartialNotice message={t("memoryModeNotice")} />}

      <Card>
        <CardContent className="flex items-center justify-between gap-3 flex-wrap py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Dot size="md" color={overall.color} />
            <p className="ui-body font-medium text-balance">{overall.message}</p>
          </div>
          <span className="ui-caption shrink-0">
            {t("serviceUptime")}
            <span className="ui-mono-value text-xs text-text-primary ml-1.5">{formatUptime(t, data.uptimeMs)}</span>
          </span>
        </CardContent>
      </Card>

      <PageSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 animate-fade-in">
          {data.sources.map((summary) => (
            <SourceCard
              key={summary.id}
              summary={summary}
              buckets={data.daily[summary.id] ?? EMPTY_BUCKETS}
              recentlyDegraded={degradedIds.has(summary.id)}
            />
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
