"use client";
import { memo, useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { useTranslation } from "@/client/providers";
import { Card, CardContent } from "@/client/components/ui/card";
import { formatShortNumber } from "@/client/utils/format";
import { registerDoughnut } from "@/client/utils/charts-register";

registerDoughnut();
import { useChartTheme } from "@/client/theme/chart-theme";
import { chartBase, defaultTooltipOptions, legendStyle, seriesColor } from "@/client/utils/charts";
import { aggregateTaskShare, OTHER_TASK_KEY, taskLabel } from "./usage";

export const UsageDonut = memo(function UsageDonut({ models }: { models: { task: string | null | undefined }[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const { slices, total } = useMemo(() => aggregateTaskShare(models), [models]);

  const data = useMemo(
    () => ({
      labels: slices.map((s) => (s.key === OTHER_TASK_KEY ? t("otherTasks") : taskLabel(s.key, t))),
      datasets: [
        {
          data: slices.map((s) => s.total),
          backgroundColor: slices.map((_, i) => theme.donut[i % theme.donut.length] ?? seriesColor(theme, i)),
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
      <CardContent className="flex flex-col h-full">
        <p className="ui-card-title mb-1">{t("opensourceTaskShare")}</p>
        <p className="ui-caption mb-4">{t("openSourceDataSource")}</p>
        {slices.length === 0 ? (
          <div
            className="flex min-h-[200px] h-[200px] sm:h-[240px] flex-1 items-center justify-center text-center ui-body-secondary"
            role="status"
          >
            {t("notAvailable")}
          </div>
        ) : (
          <div className="w-full flex-1 min-h-[200px] h-[200px] sm:h-[240px]">
            <figure className="h-full">
              <Doughnut data={data} options={options} aria-label={t("opensourceTaskShare")} role="img" />
              <figcaption className="sr-only">
                {slices.map((s) => {
                  const label = s.key === OTHER_TASK_KEY ? t("otherTasks") : taskLabel(s.key, t);
                  const pct = total > 0 ? ((s.total / total) * 100).toFixed(1) : "0.0";
                  return `${label}: ${formatShortNumber(s.total)} (${pct}%)`;
                })}
              </figcaption>
            </figure>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
