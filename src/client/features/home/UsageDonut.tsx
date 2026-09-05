import { memo, useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { Card, CardContent } from "@/client/components/ui";
import { EmptyState } from "@/client/components/shared";
import { categoryLabel, formatShortNumber } from "@/client/utils";
import "@/client/utils/charts";
import { useChartTheme } from "@/client/hooks";
import { chartBase, defaultTooltipOptions, legendStyle, seriesColor } from "@/client/utils/charts";
import type { OpenRouterRankEntry } from "@/shared/types";
import { aggregateUsageByCategory } from "./usage";

/**
 * Donut of ranked-model counts by task category (coding/reasoning/general).
 * Count-based shares keep every slice visible; token-weighted sums would let
 * a single general-purpose giant fill the pie.
 * Sits between the intelligence line chart and the provider-speed card.
 */
export const UsageDonut = memo(function UsageDonut({ entries }: { entries: OpenRouterRankEntry[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const { slices, total } = useMemo(() => aggregateUsageByCategory(entries), [entries]);

  const data = useMemo(
    () => ({
      labels: slices.map((s) => categoryLabel(s.key, t)),
      datasets: [
        {
          data: slices.map((s) => s.total),
          backgroundColor: slices.map((_, i) => seriesColor(theme, i)),
          borderColor: theme.tooltipBg,
          borderWidth: 2,
          borderRadius: 0,
          spacing: 1,
          hoverOffset: 0,
        },
      ],
    }),
    [slices, t, theme],
  );

  const options = useMemo<ChartOptions<"doughnut">>(
    () => ({
      ...chartBase,
      cutout: "62%",
      plugins: {
        legend: { ...legendStyle(theme), position: "bottom" as const },
        tooltip: {
          ...defaultTooltipOptions(theme),
          callbacks: {
            label: (ctx) => {
              const v = typeof ctx.parsed === "number" ? ctx.parsed : 0;
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0.0";
              return `${ctx.label}: ${formatShortNumber(v)} (${pct}%)`;
            },
          },
        },
      },
    }),
    [theme, total],
  );

  return (
    <Card className="h-full">
      <CardContent padding="md" className="flex flex-col h-full">
        <p className="ui-card-title mb-1">{t("usageByCategory")}</p>
        <p className="ui-caption mb-4">{t("openRouterSource")}</p>
        {slices.length === 0 ? (
          <EmptyState message={t("notAvailable")} />
        ) : (
          <div className="w-full flex-1 min-h-[200px] h-[200px] sm:h-[240px]">
            <figure className="h-full">
              <Doughnut data={data} options={options} aria-label={t("usageByCategory")} role="img" />
            </figure>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
