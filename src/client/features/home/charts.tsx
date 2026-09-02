import { memo, useMemo } from "react";
import { type ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { Card, CardContent } from "@/client/components/ui";
import { PageSection } from "@/client/components/layout";
import { shortModelId } from "@/client/utils";
import "@/client/utils/charts";
import { useChartTheme } from "@/client/hooks";
import { defaultTooltipOptions } from "@/client/utils/charts";
import { intelligenceChartTitle } from "./chartTitle";
import type { ArtificialAnalysisModel } from "@/shared/types";

/** One ranked bar row: a display label, the numeric value, and its preformatted label. */
export interface HomeBarStat {
  label: string;
  value: number;
  valueLabel: string;
}

/**
 * Unified line chart of the top-10 models by intelligence index, plotting
 * coding and agentic indices together. Y-axis is fixed 0-100.
 * Merges former Home "Top 10 intelligence vs coding" and /trends "intelligence vs agentic".
 */
export const IndexLineChart = memo(function IndexLineChart({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const top10 = useMemo(
    () =>
      [...models]
        .filter((m) => m.intelligence_index != null)
        .sort((a, b) => (b.intelligence_index ?? 0) - (a.intelligence_index ?? 0))
        .slice(0, 10),
    [models],
  );

  const data = useMemo(
    () => ({
      labels: top10.map((m) => m.short_name || shortModelId(m.name)),
      datasets: [
        {
          label: t("intelligence"),
          data: top10.map((m) => m.intelligence_index ?? null),
          borderColor: theme.palette[0],
          backgroundColor: theme.palette[0],
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          cubicInterpolationMode: "monotone" as const,
          spanGaps: false,
        },
        {
          label: t("coding"),
          data: top10.map((m) => m.coding_index ?? null),
          borderColor: theme.palette[1],
          backgroundColor: theme.palette[1],
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          cubicInterpolationMode: "monotone" as const,
          spanGaps: false,
        },
        {
          label: t("agentic"),
          data: top10.map((m) => m.agentic_index ?? null),
          borderColor: theme.palette[2],
          backgroundColor: theme.palette[2],
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          cubicInterpolationMode: "monotone" as const,
          spanGaps: false,
        },
      ],
    }),
    [top10, t, theme],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      // Hovering anywhere on the chart shows both series values, like the old shared tooltip.
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: { display: false },
          grid: { color: theme.grid },
          border: { color: theme.grid, dash: [3, 3] },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: theme.tick,
            font: { size: 10 },
            stepSize: 20,
            callback: (value) => Math.round(Number(value)).toString(),
          },
          grid: { color: theme.grid },
          border: { color: theme.grid, dash: [3, 3] },
        },
      },
      plugins: {
        legend: { labels: { color: theme.tickSecondary, font: { size: 12 } } },
        tooltip: {
          ...defaultTooltipOptions(theme),
          callbacks: {
            label: (ctx) => {
              // Null points (a model without a coding index) would render as "0" via Number(null).
              const y = ctx.parsed.y;
              return y == null ? `${ctx.dataset.label}: —` : `${ctx.dataset.label}: ${Math.round(Number(y))}`;
            },
          },
        },
      },
    }),
    [theme],
  );

  return (
    <Card>
      <CardContent padding="md">
        <p className="text-sm font-semibold mb-3">{intelligenceChartTitle(t)}</p>
        <div className="w-full h-[210px] sm:h-[260px]">
          {top10.length > 0 && <Line data={data} options={options} />}
        </div>
      </CardContent>
    </Card>
  );
});

/** Two ranked stat cards: open-source download counts and hallucination accuracy. */
export const StatisticsSection = memo(function StatisticsSection({
  downloadStats,
  hallucinationStats,
}: {
  downloadStats: HomeBarStat[];
  hallucinationStats: HomeBarStat[];
}) {
  const { t } = useTranslation();
  return (
    <PageSection title={t("statistics")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankedStatCard title={t("openSourceDownloadsStats")} source={t("huggingFaceSource")} rows={downloadStats} />
        <RankedStatCard title={t("hallucinationStats")} source={t("hallucinationSource")} rows={hallucinationStats} />
      </div>
    </PageSection>
  );
});

const RankedStatCard = memo(function RankedStatCard({
  title,
  source,
  rows,
}: {
  title: string;
  source: string;
  rows: HomeBarStat[];
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent padding="md">
        <p className="text-sm sm:text-base font-semibold mb-1">{title}</p>
        <p className="text-xs text-text-secondary mb-3">{source}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("notAvailable")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={`${row.label}-${i}`} className="flex items-center gap-3 h-7">
                <span className="text-xs sm:text-sm font-medium text-text-tertiary w-6 text-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm truncate min-w-0 flex-1">{row.label}</span>
                <span className="text-sm font-semibold font-mono shrink-0">{row.valueLabel}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
