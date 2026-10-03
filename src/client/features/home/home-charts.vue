<script lang="ts">
import { registerLine } from "@/client/utils/charts-register";

registerLine();
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { ChartData, ChartOptions, Plugin } from "chart.js";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import ChartCanvas from "@/client/components/ui/chart-canvas.vue";
import ChartFrame from "@/client/components/ui/chart-frame.vue";
import { CHART_EMPTY_CLASS, CHART_HEIGHT } from "@/client/utils/chart-metrics";
import { useTranslation } from "@/client/i18n";
import { modelDisplayName, shortModelId } from "@/shared/utils/models";
import { cn } from "@/client/utils/cn";
import {
  useChartTheme,
  cartesianChartOptions,
  seriesColor,
  hexToRgba,
  AXIS_MAX,
  AXIS_STEP,
} from "@/client/theme/chart-theme";
import { axisTickStyle, lineSeriesStyle } from "@/client/utils/charts";
import type { ArtificialAnalysisModel } from "@/shared/types";

const SERIES_KEYS = ["intelligence_index", "coding_index"] as const;
const SERIES_LABEL_KEYS = ["intelligence", "coding"] as const;
const TOP_N = 10;

type IndexSeriesKey = (typeof SERIES_KEYS)[number];
type IndexRow = ArtificialAnalysisModel & Record<IndexSeriesKey, number>;

function buildIndexRows(models: readonly ArtificialAnalysisModel[]): IndexRow[] {
  const complete = models.filter((model): model is IndexRow =>
    SERIES_KEYS.every((key) => typeof model[key] === "number" && Number.isFinite(model[key])),
  );
  complete.sort((a, b) => b.intelligence_index - a.intelligence_index);
  return complete.slice(0, TOP_N);
}

function indexAxisX(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * AXIS_MAX;
}

function formatIndexValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(2)).toString();
}

const AREA_FILL_ALPHA = 0.2;

const tickLabel = (value: string | number): string => formatIndexValue(Number(value));

function bottomRule(color: string): Plugin<"line"> {
  return {
    id: "indexAreaBottomRule",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const y = Math.round(chartArea.bottom) + 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = color;
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.restore();
    },
  };
}

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const theme = useChartTheme();
const rows = computed(() => buildIndexRows(props.models));
const plugins = computed<Plugin<"line">[]>(() => [bottomRule(theme.value.grid)]);
const labels = computed(() => rows.value.map((m) => m.short_name || shortModelId(m.name) || m.id || "—"));

const data = computed<ChartData<"line">>(() => ({
  datasets: SERIES_KEYS.map((key, slot) => {
    const color = seriesColor(theme.value, slot);
    return {
      label: t(SERIES_LABEL_KEYS[slot]!),
      data: rows.value.map((m, i) => ({ x: indexAxisX(i, rows.value.length), y: m[key] })),
      borderColor: color,
      backgroundColor: hexToRgba(color, AREA_FILL_ALPHA),
      fill: true,
      ...lineSeriesStyle,
    };
  }),
}));

const options = computed<ChartOptions<"line">>(() =>
  cartesianChartOptions<"line", "linear">(theme.value, {
    interaction: { mode: "index", intersect: false },
    x: {
      type: "linear",
      min: 0,
      max: AXIS_MAX,
      ticks: { ...axisTickStyle(theme.value), stepSize: AXIS_STEP, callback: tickLabel },
    },
    y: {
      min: 0,
      max: AXIS_MAX,
      ticks: { ...axisTickStyle(theme.value), stepSize: AXIS_STEP, callback: tickLabel },
    },
    tooltip: {
      callbacks: {
        title: (items) => labels.value[items[0]?.dataIndex ?? -1] ?? "",
        label: (ctx) => {
          const y = ctx.parsed.y;
          return `${ctx.dataset.label}: ${y == null ? "—" : formatIndexValue(Number(y))}`;
        },
      },
    },
  }),
);

const caption = computed(() =>
  rows.value
    .map(
      (m) =>
        `${modelDisplayName(m)}: ${SERIES_KEYS.map(
          (key, slot) => `${t(SERIES_LABEL_KEYS[slot]!)} ${formatIndexValue(m[key])}`,
        ).join(", ")}`,
    )
    .join("; "),
);
</script>

<template>
  <Card>
    <CardContent>
      <CardHeader :title="t('intelligenceIndex')" :subtitle="t('artificialSource')" />
      <div v-if="rows.length === 0" :class="cn(CHART_EMPTY_CLASS, CHART_HEIGHT)" role="status">
        {{ t("noRankingsData") }}
      </div>
      <ChartFrame v-else>
        <ChartCanvas
          type="line"
          :data="data"
          :options="options"
          :plugins="plugins"
          :aria-label="t('intelligenceIndex')"
          role="img"
        />
        <figcaption class="sr-only">{{ caption }}</figcaption>
      </ChartFrame>
    </CardContent>
  </Card>
</template>
