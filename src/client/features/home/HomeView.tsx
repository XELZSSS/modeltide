"use client";
import { Suspense, lazy } from "react";
import { SafeLink as Link } from "@/client/router";
import { useTranslation } from "@/client/providers";
import {
  useSuspenseArtificialRankings,
  useSuspenseClosedReleases,
  useSuspenseHomeDashboard,
  useSuspenseHallucinationRankings,
  useSuspenseStatusHistory,
} from "@/client/api/queries";
import { SuspenseQuery, PartialNotice } from "@/client/components/feedback";
import { SearchInput } from "@/client/search/SearchInput";
import { Card, CardContent } from "@/client/components/ui/card";
import { PageContainer, PageSection } from "@/client/components/layout";
import { Dot } from "@/client/components/ui/primitives";
import { SOURCE_LABELS } from "@/shared/config";
import { formatRelativeTime, formatUptimePct } from "@/client/utils/format";
import { LEVEL_STYLES, resolveLevel } from "@/client/utils/status-level";
import { useHomeStats } from "./use-home-stats";
import { KpiStrip, ProviderSpeedCard, TextToImageSection } from "./cards";

const IndexLineChart = lazy(() => import("./charts").then((m) => ({ default: m.IndexLineChart })));
const UsageDonut = lazy(() => import("./UsageDonut").then((m) => ({ default: m.UsageDonut })));
const StatisticsSection = lazy(() => import("./statistics-section").then((m) => ({ default: m.StatisticsSection })));

const EVENT_STYLES = {
  down: { color: "var(--destructive)", text: "text-destructive", labelKey: "eventDown" },
  degraded: { color: "var(--warning)", text: "text-warning", labelKey: "eventDegraded" },
  up: { color: "var(--success)", text: "text-success", labelKey: "eventUp" },
} as const;

function HomeLatestEvents() {
  const { t, lang } = useTranslation();
  const { data } = useSuspenseStatusHistory();
  const latest = (data.events ?? [])[0] ?? null;
  const eventStyle = latest ? EVENT_STYLES[latest.type] : null;
  const labelKey =
    latest && Object.hasOwn(SOURCE_LABELS, latest.id)
      ? (SOURCE_LABELS as Record<string, (typeof SOURCE_LABELS)[keyof typeof SOURCE_LABELS]>)[latest.id]
      : undefined;
  if (!latest) {
    return (
      <Link
        href="/status"
        className="flex h-10 items-center gap-2 min-w-0 w-full border border-border rounded-none bg-bg-card px-3.5 hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <span className="text-sm text-text-tertiary truncate">{t("noRecentEvents")}</span>
      </Link>
    );
  }
  const summary = data.sources.find((s) => s.id === latest.id);
  const samples = data.recent?.[latest.id] ?? [];
  const lastSample = samples.length > 0 ? samples[samples.length - 1] : undefined;
  const level = resolveLevel(summary);
  const latencyMs = summary?.avgLatency24h ?? summary?.latencyMs ?? lastSample?.latencyMs ?? null;
  const errorText = lastSample?.error ?? null;
  const statusCode = lastSample?.status ?? null;
  const detailText = errorText ?? (statusCode != null && level === "error" ? `HTTP ${statusCode}` : null);
  return (
    <Link
      href="/status"
      className="flex h-10 items-center gap-2 min-w-0 w-full overflow-hidden border border-border rounded-none bg-bg-card px-3.5 hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <Dot size="sm" color={eventStyle!.color} aria-hidden="true" />
      <span className="text-sm truncate min-w-0 flex-1 whitespace-nowrap">
        <span className={`font-medium ${eventStyle!.text}`}>{t(eventStyle!.labelKey)}</span>
        <span className="text-text-secondary mx-1.5">·</span>
        <span className="text-text-secondary">{labelKey ? t(labelKey) : latest.id}</span>
        <span className="text-text-secondary mx-1.5">·</span>
        <span className={`font-medium ${LEVEL_STYLES[level].text}`}>{t(LEVEL_STYLES[level].labelKey)}</span>
        <span className="text-text-secondary mx-1.5">·</span>
        <span className="text-text-secondary font-mono" title={t("uptime24h")}>
          {formatUptimePct(t, summary?.uptime24h ?? null)}
        </span>
        <span className="text-text-secondary mx-1.5">·</span>
        <span
          className="text-text-secondary font-mono"
          title={`${t("latencyAvg24h")}${summary?.checkedAt ? ` · ${t("lastUpdated")} ${formatRelativeTime(summary.checkedAt, t, lang)}` : ""}`}
        >
          {latencyMs != null ? `${(latencyMs / 1000).toFixed(2)}s` : t("uptimeNoData")}
        </span>
        {detailText && (
          <>
            <span className="text-text-secondary mx-1.5">·</span>
            <span className="text-text-tertiary font-mono" title={detailText}>
              {detailText}
            </span>
          </>
        )}
      </span>
      <span className="flex items-center gap-2 text-xs text-text-secondary shrink-0">
        {latest.type !== "up" && (
          <span className="font-mono whitespace-nowrap">
            {latest.durationMin == null ? t("eventOngoing") : t("eventDurationMin", { value: latest.durationMin })}
          </span>
        )}
        <span className="whitespace-nowrap">{formatRelativeTime(latest.at, t, lang)}</span>
      </span>
    </Link>
  );
}

function HomeContent() {
  const { t } = useTranslation();
  const artificialData = useSuspenseArtificialRankings();
  const hallucinationRankings = useSuspenseHallucinationRankings();
  const dashboardData = useSuspenseHomeDashboard();
  const closedReleases = useSuspenseClosedReleases();
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
          <SearchInput className="w-full sm:w-full" />
        </div>
      </div>

      {dashboardData.partial && (
        <div className="mb-4">
          <PartialNotice message={t("partialDataNotice")} />
        </div>
      )}

      <div className="mb-5 sm:mb-6">
        <KpiStrip kpis={kpiStrip} />
      </div>

      <PageSection>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-6">
            <Suspense
              fallback={
                <Card>
                  <CardContent>
                    <p className="ui-card-title mb-1">{t("intelligenceIndex")}</p>
                    <p className="ui-caption mb-4">{t("artificialSource")}</p>
                    <div className="h-[200px] sm:h-[240px] animate-pulse bg-bg-secondary" />
                  </CardContent>
                </Card>
              }
            >
              <IndexLineChart models={artificialData} />
            </Suspense>
          </div>
          <div className="lg:col-span-3">
            <Suspense
              fallback={
                <Card>
                  <CardContent>
                    <div className="h-[200px] sm:h-[240px] animate-pulse bg-bg-secondary" />
                  </CardContent>
                </Card>
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
