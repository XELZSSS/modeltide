"use client";
import { memo, useMemo } from "react";
import { useParams } from "@/client/router";
import { type ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { useSuspenseStatusHistory } from "@/client/api/queries";
import { NotFound, SuspenseQuery } from "@/client/components/feedback";
import { PageContainer, PageSection, SectionCard } from "@/client/components/layout";
import { DetailPageLayout } from "@/client/features/models/model-details/detail-views";
import { StatCard } from "@/client/components/ui/stat-card";
import { StatGrid } from "@/client/components/ui/grids";
import { formatUptimePct } from "@/client/utils/format";
import { registerLine } from "@/client/utils/charts-register";

registerLine();
import { useChartTheme } from "@/client/theme/chart-theme";
import {
  defaultTooltipOptions,
  chartBase,
  axisTickStyle,
  axisGridStyle,
  axisDashedBorderStyle,
} from "@/client/utils/charts";
import { SOURCE_LABELS, SOURCE_IDS, ONE_HOUR } from "@/shared/config";
import type { SourceStatus } from "@/shared/types";
import { LEVEL_STYLES, resolveLevel } from "@/client/utils/status-level";
import { UptimeStrip } from "./StatusParts";
import { StatusEventList } from "@/client/components/status-events";

function isSourceId(value: string | undefined): value is SourceStatus["id"] {
  return value != null && (SOURCE_IDS as readonly string[]).includes(value);
}

const BEIJING_OFFSET_MS = 8 * ONE_HOUR;
export const formatBeijingHHMM = (ts: number): string =>
  new Date(ts + BEIJING_OFFSET_MS).toISOString().slice(11, 16);

const EMPTY_SAMPLES: { t: number; latencyMs: number | null }[] = [];
const EMPTY_BUCKETS: import("@/shared/types").DayBucket[] = [];

export function decimateSamples<T extends { t: number; latencyMs?: number | null }>(samples: T[], max = 300): T[] {
  if (samples.length <= max) return samples;
  // Peak-preserving stride: keep the max-latency sample per bucket so
  // spikes survive decimation instead of being skipped by uniform sampling.
  const bucketSize = samples.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    let best = samples[start]!;
    for (let j = start + 1; j < end && j < samples.length; j++) {
      const cur = samples[j]!;
      if ((cur.latencyMs ?? -1) > (best.latencyMs ?? -1)) best = cur;
    }
    out.push(best);
  }
  return out;
}

const LatencyChart = memo(function LatencyChart({ samples }: { samples: { t: number; latencyMs: number | null }[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const decimated = useMemo(() => decimateSamples(samples), [samples]);

  const latencyColor = useMemo(
    () =>
      typeof document === "undefined"
        ? theme.palette[6]?.trim() || theme.tick
        : getComputedStyle(document.documentElement).getPropertyValue("--chart-7")?.trim() ||
          theme.palette[6]?.trim() ||
          theme.tick,
    [theme],
  );
  const data = useMemo(
    () => ({
      labels: decimated.map((s) => formatBeijingHHMM(s.t)),
      datasets: [
        {
          label: `${t("latencyHistory")} (GMT+8)`,
          data: decimated.map((s) => (s.latencyMs != null ? s.latencyMs / 1000 : null)),
          borderColor: latencyColor,
          backgroundColor: latencyColor,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: false,
        },
      ],
    }),
    [decimated, t, latencyColor],
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
            title: (items) => items[0]?.label ?? "",
            label: (ctx) => (ctx.parsed.y == null ? "—" : `${Number(ctx.parsed.y).toFixed(2)}s`),
          },
        },
      },
    }),
    [theme],
  );

  return (
    <div className="w-full h-[200px] min-w-0 overflow-hidden">
      <figure className="h-full [&_canvas]:block">
        <Line data={data} options={options} role="img" aria-label={t("latencyHistory")} />
      </figure>
    </div>
  );
});

const CONTENT = memo(function Content({ id }: { id: SourceStatus["id"] }) {
  const { t } = useTranslation();
  const { data } = useSuspenseStatusHistory();
  const summary = data.sources.find((s) => s.id === id);
  const recent = data.recent[id] ?? EMPTY_SAMPLES;
  const buckets = data.daily[id] ?? EMPTY_BUCKETS;
  const events = data.events.filter((e) => e.id === id).slice(0, 10);
  const uptimeStats = [
    { id: "uptime24h", value: formatUptimePct(t, summary?.uptime24h ?? null) },
    { id: "uptime7d", value: formatUptimePct(t, summary?.uptime7d ?? null) },
  ] as const;

  return (
    <PageContainer>
      <DetailPageLayout
        backLabelKey="backToStatus"
        backTo="/status"
        title={t(SOURCE_LABELS[id])}
        description={t("statusPageTitle")}
      >
        <StatGrid columns={4}>
          <StatCard label={t("statusCurrent")} value={t(LEVEL_STYLES[resolveLevel(summary)].labelKey)} />
          {uptimeStats.map(({ id, value }) => (
            <StatCard key={id} label={t(id)} value={value} />
          ))}
          <StatCard
            label={t("latencyAvg24h")}
            value={summary?.avgLatency24h != null ? `${(summary.avgLatency24h / 1000).toFixed(2)}s` : t("uptimeNoData")}
          />
        </StatGrid>

        <SectionCard title={t("latencyHistory")}>
          {recent.length > 1 ? (
            <LatencyChart samples={recent} />
          ) : (
            <p className="ui-body-secondary py-10 text-center">{t("historyAccumulating")}</p>
          )}
        </SectionCard>

        <SectionCard title={t("last30Days")}>
          <UptimeStrip buckets={buckets} />
        </SectionCard>

        <PageSection title={t("recentEvents")}>
          <StatusEventList events={events} emptyMessage={t("noRecentEvents")} />
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
    <SuspenseQuery key={source}>
      <CONTENT id={source} />
    </SuspenseQuery>
  );
}
