import { useMemo } from "react";
import type { ChartOptions } from "chart.js";
import { Radar } from "react-chartjs-2";
import { registerRadar } from "@/client/utils/charts-register";

registerRadar();
import { useTranslation } from "@/client/providers";
import { useChartTheme, hexToRgba, legendStyle, seriesColor } from "@/client/theme/chart-theme";
import { Card, CardContent } from "@/client/components/ui/card";
import { ChartFrame } from "@/client/components/ui/chart-frame";
import { axisTickStyle, chartBase, defaultTooltipOptions } from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelDisplayName, modelId } from "@/client/utils/model-utils";
import { buildRadarData, radarMaxFor } from "./compare-logic";

export function CompareRadarChart({ models }: { models: ArtificialAnalysisModel[] }) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const radarData = useMemo(() => buildRadarData(t, models), [models, t]);
  const radarMax = useMemo(() => radarMaxFor(radarData), [radarData]);

  const data = useMemo(
    () => ({
      labels: radarData.map((row) => row.metric),
      datasets: models.map((model, index) => {
        const color = seriesColor(theme, index);
        const key = modelId(model);
        return {
          label: modelDisplayName(model),
          data: radarData.map((row) => (key ? (row.values[key] ?? null) : null)),
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.06),
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
        };
      }),
    }),
    [radarData, models, theme],
  );

  const options = useMemo<ChartOptions<"radar">>(
    () => ({
      ...chartBase,
      interaction: { mode: "index", intersect: false },
      layout: { padding: 8 },
      scales: {
        r: {
          min: 0,
          max: radarMax,
          ticks: {
            ...axisTickStyle(theme),
            stepSize: 25,
            backdropColor: "transparent",
          },
          grid: { color: theme.grid },
          angleLines: { color: theme.grid },
          pointLabels: { color: theme.tickSecondary, font: { size: 11 } },
        },
      },
      plugins: {
        legend: legendStyle(theme),
        tooltip: defaultTooltipOptions(theme),
      },
    }),
    [theme, radarMax],
  );

  return (
    <Card className="w-full md:w-1/2">
      <CardContent className="h-full flex items-center justify-center">
        <ChartFrame height="h-[240px] sm:h-[320px]">
          <Radar data={data} options={options} role="img" aria-label={t("modelComparison")} />
          <figcaption className="sr-only">
            {radarData.map((row) => {
              const values = models.map((m) => {
                const key = modelId(m);
                const v = key ? row.values[key] : null;
                return `${modelDisplayName(m)}: ${typeof v === "number" ? v.toFixed(1) : "—"}`;
              });
              return `${row.metric} — ${values.join(", ")}`;
            })}
          </figcaption>
        </ChartFrame>
      </CardContent>
    </Card>
  );
}
