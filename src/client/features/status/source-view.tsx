import { Suspense, memo } from "react";
import { useParams } from "@/client/router";
import { useTranslation } from "@/client/providers";
import { useSuspenseStatusHistory } from "@/client/api/api-queries";
import { unwrapObject } from "@/client/api/payload-normalize";
import { NotFound } from "@/client/components/feedback";
import { SuspenseQuery } from "@/client/router/suspense-query";
import { PageContainer, PageSection, SectionCard, DetailPageLayout } from "@/client/components/layout";
import { StatCard } from "@/client/components/ui/stat-card";
import { StatGrid } from "@/client/components/ui/grids";
import { ChartSkeleton } from "@/client/components/ui/chart-frame";
import { formatUptimePct } from "@/client/utils/format";
import { cn } from "@/client/utils/cn";
import { SOURCE_LABELS, SOURCE_IDS } from "@/shared/config";
import type { DayBucket, SourceId, StatusHistoryPayload } from "@/shared/types";
import { LEVEL_STYLES, resolveLevel } from "@/client/utils/status-level";
import { UptimeStrip } from "./status-parts";
import { StatusEventList } from "./status-events";
import { loadableView } from "@/client/router/lazy-view";

const LatencyChart = loadableView(() => import("./latency-chart").then((m) => ({ default: m.LatencyChart })));

function isSourceId(value: string | undefined): value is SourceId {
  return value != null && (SOURCE_IDS as readonly string[]).includes(value);
}

const EMPTY_SAMPLES: { t: number; latencyMs: number | null }[] = [];
const EMPTY_BUCKETS: DayBucket[] = [];

const CONTENT = memo(function Content({ id }: { id: SourceId }) {
  const { t } = useTranslation();
  const { data } = useSuspenseStatusHistory();
  const history = unwrapObject<StatusHistoryPayload>(data, "statusHistory");
  const summary = history.sources.find((s) => s.id === id);
  const recent = history.recent[id] ?? EMPTY_SAMPLES;
  const buckets = history.daily[id] ?? EMPTY_BUCKETS;
  const level = resolveLevel(summary);
  const detail = summary?.detail ?? null;

  return (
    <PageContainer>
      <DetailPageLayout
        backLabelKey="backToStatus"
        backTo="/status"
        title={t(SOURCE_LABELS[id])}
        description={t("statusPageTitle")}
      >
        <StatGrid columns={4}>
          <StatCard label={t("statusCurrent")} value={t(LEVEL_STYLES[level].labelKey)} />
          <StatCard label={t("uptime24h")} value={formatUptimePct(summary?.uptime24h ?? null, t)} />
          <StatCard label={t("uptime7d")} value={formatUptimePct(summary?.uptime7d ?? null, t)} />
          <StatCard
            label={t("latencyAvg24h")}
            value={summary?.avgLatency24h != null ? `${(summary.avgLatency24h / 1000).toFixed(2)}s` : t("uptimeNoData")}
          />
        </StatGrid>

        {}
        {(summary?.degraded24h ?? 0) > 0 && (
          <p className="ui-caption text-warning">
            {t("degraded24h")}
            <span className="ui-mono-value text-xs ml-1.5">{formatUptimePct(summary?.degraded24h ?? null, t)}</span>
          </p>
        )}

        {detail && (
          <p className={cn("ui-body-secondary break-words", level === "error" ? "text-destructive" : "text-warning")}>
            {detail}
          </p>
        )}

        <SectionCard title={t("latencyHistory")}>
          {recent.length > 1 ? (
            <Suspense fallback={<ChartSkeleton height="h-[200px]" />}>
              <LatencyChart samples={recent} />
            </Suspense>
          ) : (
            <p className="ui-body-secondary py-10 text-center">{t("historyAccumulating")}</p>
          )}
        </SectionCard>

        <SectionCard title={t("last30Days")}>
          <UptimeStrip buckets={buckets} />
        </SectionCard>

        <PageSection title={t("recentEvents")}>
          <StatusEventList events={history.events} sourceId={id} limit={10} emptyMessage={t("noRecentEvents")} />
        </PageSection>
      </DetailPageLayout>
    </PageContainer>
  );
});

export function SourceDetailView() {
  const params = useParams<{ source: string }>("/status/:source");
  const source = params.source;
  if (!isSourceId(source)) return <NotFound />;
  return (
    <SuspenseQuery resetKey={source}>
      <CONTENT id={source} />
    </SuspenseQuery>
  );
}
