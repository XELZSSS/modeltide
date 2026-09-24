import { Fragment, Suspense, useMemo } from "react";
import { SafeLink as Link } from "@/client/router";
import { useTranslation } from "@/client/providers";
import {
  useSuspenseArtificialRankingsState,
  useSuspenseClosedReleasesState,
  useSuspenseHomeDashboard,
  useSuspenseHallucinationRankings,
  useSuspenseStatusHistory,
} from "@/client/api/api-queries";
import { PartialNotice } from "@/client/components/feedback";
import { SuspenseQuery } from "@/client/router/suspense-query";
import { unwrapObject } from "@/client/api/payload-normalize";
import { SearchInput } from "@/client/search/search-input";
import { ChartCard } from "@/client/components/ui/chart-frame";
import { PageContainer, PageSection } from "@/client/components/layout";
import { Dot } from "@/client/components/ui/primitives";
import { eventDurationLabel, resolveEventStyle } from "@/client/features/status/status-events";
import { sourceLabelKey } from "@/shared/config";
import type { StatusHistoryPayload } from "@/shared/types";
import { formatRelativeTime, formatUptimePct } from "@/client/utils/format";
import { LEVEL_STYLES, resolveLevel } from "@/client/utils/status-level";
import { useHomeStats } from "./use-home-stats";
import { KpiStrip, ProviderSpeedCard, TextToImageSection } from "./home-cards";
import { loadableView } from "@/client/router/lazy-view";

const IndexAreaChart = loadableView(() => import("./home-charts").then((m) => ({ default: m.IndexAreaChart })));
const UsageDonut = loadableView(() => import("./usage-donut").then((m) => ({ default: m.UsageDonut })));
const StatisticsSection = loadableView(() =>
  import("./statistics-section").then((m) => ({ default: m.StatisticsSection })),
);

const EVENT_LINK_CLASS =
  "flex h-9 items-center gap-2 min-w-0 w-full ui-card px-3.5 transition-colors duration-fast hoverable:hover:border-text-tertiary/40 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

function useLatestEventSummary() {
  const { data } = useSuspenseStatusHistory();
  const history = unwrapObject<StatusHistoryPayload>(data, "statusHistory");
  return useMemo(() => {
    const latest = (history.events ?? [])[0] ?? null;
    if (!latest) return { latest: null as null, summary: undefined, lastSample: undefined, level: "unknown" as const };
    const summary = history.sources.find((s) => s.id === latest.id);
    const samples = history.recent?.[latest.id] ?? [];
    const lastSample = samples.length > 0 ? samples.reduce((a, b) => (b.t > a.t ? b : a)) : undefined;
    return { latest, summary, lastSample, level: resolveLevel(summary) };
  }, [history]);
}

function HomeLatestEvents() {
  const { t, lang } = useTranslation();
  const { latest, summary, lastSample, level } = useLatestEventSummary();

  const view = useMemo(() => {
    if (!latest) return null;
    const eventStyle = resolveEventStyle(latest.type);
    const labelKey = sourceLabelKey(latest.id);
    const latencyMs = summary?.avgLatency24h ?? summary?.latencyMs ?? lastSample?.latencyMs ?? null;
    const errorText = lastSample?.error ?? null;
    const statusCode = lastSample?.status ?? null;
    const detailText = errorText ?? (statusCode != null && level === "error" ? `HTTP ${statusCode}` : null);
    const meta: { key: string; className: string; text: string; title?: string }[] = [
      { key: "event", className: `font-medium ${eventStyle.text}`, text: t(eventStyle.labelKey) },
      { key: "source", className: "text-text-secondary", text: labelKey ? t(labelKey) : latest.id },
      { key: "level", className: `font-medium ${LEVEL_STYLES[level].text}`, text: t(LEVEL_STYLES[level].labelKey) },
      {
        key: "uptime",
        className: "text-text-secondary font-mono",
        title: t("uptime24h"),
        text: formatUptimePct(summary?.uptime24h ?? null, t),
      },
      {
        key: "latency",
        className: "text-text-secondary font-mono",
        title: `${t("latencyAvg24h")}${summary?.checkedAt ? ` · ${t("lastUpdated")} ${formatRelativeTime(summary.checkedAt, t, lang)}` : ""}`,
        text: latencyMs != null ? `${(latencyMs / 1000).toFixed(2)}s` : t("uptimeNoData"),
      },
      ...(detailText
        ? [{ key: "detail", className: "text-text-tertiary font-mono", title: detailText, text: detailText }]
        : []),
    ];
    return { eventStyle, meta };
  }, [t, lang, latest, summary, lastSample, level]);

  if (!latest || !view) {
    return (
      <Link href="/status" className={EVENT_LINK_CLASS}>
        <span className="ui-body-secondary truncate">{t("noRecentEvents")}</span>
      </Link>
    );
  }
  const { eventStyle, meta } = view;
  return (
    <Link href="/status" className={`${EVENT_LINK_CLASS} overflow-hidden`}>
      <Dot size="sm" color={eventStyle.color} />
      <span className="ui-body truncate min-w-0 flex-1 whitespace-nowrap">
        {meta.map((seg, i) => (
          <Fragment key={seg.key}>
            {i > 0 && <span className="text-text-secondary mx-1.5">·</span>}
            <span className={seg.className} title={seg.title}>
              {seg.text}
            </span>
          </Fragment>
        ))}
      </span>
      <span className="flex items-center gap-2 text-xs text-text-secondary shrink-0">
        {latest.type !== "up" && (
          <span className="font-mono whitespace-nowrap">{eventDurationLabel(t, latest.durationMin)}</span>
        )}
        <span className="whitespace-nowrap">{formatRelativeTime(latest.at, t, lang)}</span>
      </span>
    </Link>
  );
}

function HomeContent() {
  const { t } = useTranslation();
  const { items: artificialData, partial: artificialPartial } = useSuspenseArtificialRankingsState();
  const hallucinationRankings = useSuspenseHallucinationRankings();
  const dashboardData = useSuspenseHomeDashboard();
  const { items: closedReleases, partial: closedReleasesPartial } = useSuspenseClosedReleasesState();
  const { trendingStats, hallucinationStats, kpiStrip, providerStats, t2iModels } = useHomeStats(
    artificialData,
    hallucinationRankings,
    dashboardData,
    t,
    closedReleases,
  );

  return (
    <PageContainer>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 min-w-0 mb-4">
        <div className="hidden md:block md:col-span-2 lg:col-span-3 min-w-0">
          <HomeLatestEvents />
        </div>
        <div className="min-w-0 col-span-2 sm:col-span-3 md:col-span-1 flex">
          <SearchInput className="w-full" />
        </div>
      </div>

      {(dashboardData.partial || closedReleasesPartial || artificialPartial) && <PartialNotice />}

      <div className="mb-5 sm:mb-6">
        <KpiStrip kpis={kpiStrip} />
      </div>

      <PageSection>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-6">
            <Suspense fallback={<ChartCard loading title={t("intelligenceIndex")} subtitle={t("artificialSource")} />}>
              <IndexAreaChart models={artificialData} />
            </Suspense>
          </div>
          <div className="lg:col-span-3">
            <Suspense
              fallback={
                <ChartCard
                  loading
                  className="h-full"
                  contentClassName="flex flex-col h-full"
                  title={t("opensourceTaskShare")}
                  subtitle={t("openSourceDataSource")}
                  skeletonHeight="flex-1 min-h-[200px] h-[200px] sm:h-[240px]"
                />
              }
            >
              <UsageDonut models={dashboardData.opensource} />
            </Suspense>
          </div>
          <div className="lg:col-span-3">
            <ProviderSpeedCard providerStats={providerStats} />
          </div>
        </div>
      </PageSection>

      <Suspense fallback={null}>
        <StatisticsSection trendingStats={trendingStats} hallucinationStats={hallucinationStats} />
      </Suspense>

      <TextToImageSection models={t2iModels} />
    </PageContainer>
  );
}

export function HomeView() {
  return (
    <SuspenseQuery>
      <HomeContent />
    </SuspenseQuery>
  );
}
