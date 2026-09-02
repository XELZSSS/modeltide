import { memo, useMemo } from "react";
import { useParams } from "react-router";
import { type ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { useSuspenseStatusHistory } from "@/client/api/queries";
import { BackButton, NotFound, SuspenseQuery } from "@/client/components/shared";
import { PageContainer, PageHeader, PageSection } from "@/client/components/layout";
import { Card, CardContent, StatCard, StatGrid } from "@/client/components/ui";
import { formatUptimePct } from "@/client/utils";
import "@/client/utils/charts";
import { useChartTheme } from "@/client/hooks";
import { defaultTooltipOptions, chartBase, axisTickStyle, axisGridStyle, axisDashedBorderStyle } from "@/client/utils/charts";
import { SOURCE_LABELS, SOURCE_IDS, ONE_HOUR } from "@/shared/config";
import type { SourceStatus } from "@/shared/types";
import { UptimeStrip } from "./UptimeStrip";
import { StatusEventRow } from "./StatusEventRow";

function isSourceId(value: string | undefined): value is SourceStatus["id"] {
  return value != null && (SOURCE_IDS as readonly string[]).includes(value);
}

// Beijing time (UTC+8, no DST). The offset is applied manually and the UTC fields are
// read so the labels never depend on the viewer's host timezone.
const BEIJING_OFFSET_MS = 8 * ONE_HOUR;
const beijingHHMM = (ts: number): string => new Date(ts + BEIJING_OFFSET_MS).toISOString().slice(11, 16);

const LatencyChart = memo(function LatencyChart({ samples }: { samples: { t: number; latencyMs: number | null }[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();

  const data = useMemo(
    () => ({
      labels: samples.map((s) => beijingHHMM(s.t)),
      datasets: [
        {
          label: t("latencyHistory"),
          data: samples.map((s) => (s.latencyMs != null ? s.latencyMs / 1000 : null)),
          borderColor: theme.palette[6],
          backgroundColor: theme.palette[6],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: false,
        },
      ],
    }),
    [samples, t, theme],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      ...chartBase,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { display: false, maxTicksLimit: 8 }, grid: { display: false }, border: axisGridStyle(theme) },
        y: {
          ticks: { ...axisTickStyle(theme), callback: (value) => `${value}s` },
          grid: axisGridStyle(theme),
          border: axisDashedBorderStyle(theme),
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...defaultTooltipOptions(theme),
          callbacks: {
            title: (items) => (items[0] ? beijingHHMM(samples[items[0]!.dataIndex]?.t ?? 0) : ""),
            label: (ctx) => (ctx.parsed.y == null ? "—" : `${Number(ctx.parsed.y).toFixed(2)}s`),
          },
        },
      },
    }),
    [theme, samples],
  );

  return (
    <div className="w-full h-[200px]">
      <Line data={data} options={options} />
    </div>
  );
});

const CONTENT = memo(function Content({ id }: { id: SourceStatus["id"] }) {
  const { t } = useTranslation();
  const { data } = useSuspenseStatusHistory();
  const summary = data.sources.find((s) => s.id === id);
  const recent = data.recent[id] ?? [];
  const buckets = data.daily[id] ?? [];
  const events = data.events.filter((e) => e.id === id).slice(0, 10);
  const pct = (v: number | null) => formatUptimePct(t, v);

  return (
    <PageContainer>
      <BackButton labelKey="backToStatus" to="/status" />
      <PageHeader title={t(SOURCE_LABELS[id])} description={t("statusPageTitle")} />

      <StatGrid columns={4}>
        <StatCard label={t("statusCurrent")} value={summary?.ok ? t("statusOnline") : t("statusOffline")} />
        <StatCard label={t("uptime24h")} value={pct(summary?.uptime24h ?? null)} />
        <StatCard label={t("uptime7d")} value={pct(summary?.uptime7d ?? null)} />
        <StatCard
          label={t("latencyAvg24h")}
          value={summary?.avgLatency24h != null ? `${(summary.avgLatency24h / 1000).toFixed(2)}s` : t("uptimeNoData")}
        />
      </StatGrid>

      <PageSection title={t("latencyHistory")}>
        <Card>
          <CardContent padding="md">
            {recent.length > 1 ? (
              <LatencyChart samples={recent} />
            ) : (
              <p className="text-sm text-text-secondary py-8 text-center">{t("historyAccumulating")}</p>
            )}
          </CardContent>
        </Card>
      </PageSection>

      <PageSection title={t("last90Days")}>
        <Card>
          <CardContent padding="md">
            <UptimeStrip buckets={buckets} />
          </CardContent>
        </Card>
      </PageSection>

      <PageSection title={t("recentEvents")}>
        {events.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("noRecentEvents")}</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-bg-card">
            {events.map((event) => (
              <StatusEventRow key={event.at} event={event} />
            ))}
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
});

/** Per-source status detail: latency history, availability strips and events. */
export function SourceDetailView() {
  const { source } = useParams<{ source: SourceStatus["id"] }>();
  if (!isSourceId(source)) return <NotFound />;
  return (
    <SuspenseQuery key={source}>
      <CONTENT id={source} />
    </SuspenseQuery>
  );
}
