<script lang="ts">
import { registerLine } from "@/client/charts/register";

registerLine();
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { ChartData, ChartOptions } from "chart.js";
import Card from "@/client/components/card.vue";
import CardContent from "@/client/components/card-content.vue";
import CardHeader from "@/client/components/card-header.vue";
import ChartCanvas from "@/client/components/chart-canvas.vue";
import ChartFrame from "@/client/components/chart-frame.vue";
import { CHART_EMPTY_CLASS, FLEX_CHART_HEIGHT } from "@/client/charts/tokens";
import EmptyState from "@/client/components/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import { modelDisplayName, shortModelId } from "@/shared/utils/models";
import { cn } from "@/client/utils/cn";
import { AXIS_MAX, AXIS_STEP, cartesianChartOptions, seriesColor, useChartTheme } from "@/client/charts/theme";
import { axisTickStyle, lineSeriesStyle } from "@/client/charts/factory";
import type { ArtificialAnalysisModel } from "@/shared/types";

const SERIES_KEYS = ["intelligence_index", "coding_index"] as const;
const SERIES_LABEL_KEYS = ["intelligence", "coding"] as const;
const TOP_N = 10;
const AXIS_POINT_RADIUS = 4;
const AXIS_POINT_HOVER_RADIUS = 7;

type IndexSeriesKey = (typeof SERIES_KEYS)[number];

// ~10 categories across a half-width card: long names would overlap.
const AXIS_LABEL_MAX_CHARS = 8;
type IndexRow = ArtificialAnalysisModel & Record<IndexSeriesKey, number>;

function buildIndexRows(models: readonly ArtificialAnalysisModel[]): IndexRow[] {
  const complete = models.filter((model): model is IndexRow =>
    SERIES_KEYS.every((key) => typeof model[key] === "number" && Number.isFinite(model[key])),
  );
  complete.sort((a, b) => b.intelligence_index - a.intelligence_index);
  return complete.slice(0, TOP_N);
}

function formatIndexValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(2)).toString();
}

const tickLabel = (value: string | number): string => formatIndexValue(Number(value));

function axisLabel(value: string): string {
  return value.length > AXIS_LABEL_MAX_CHARS ? `${value.slice(0, AXIS_LABEL_MAX_CHARS - 1)}…` : value;
}

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const theme = useChartTheme();
const rows = computed(() => buildIndexRows(props.models));
// Long names are clipped on the axis; the full name stays in the tooltip title.
const fullLabels = computed(() => rows.value.map((m) => m.short_name || shortModelId(m.name) || m.id || "—"));
const labels = computed(() => fullLabels.value.map(axisLabel));

const data = computed<ChartData<"line">>(() => ({
  labels: labels.value,
  datasets: SERIES_KEYS.map((key, slot) => {
    const color = seriesColor(theme.value, slot);
    return {
      label: t(SERIES_LABEL_KEYS[slot]!),
      data: rows.value.map((m) => m[key]),
      borderColor: color,
      backgroundColor: color,
      // A trend line, not an area chart: the two series would muddy each other.
      fill: false,
      ...lineSeriesStyle,
      // Straight segments between points: lineSeriesStyle opts into monotone
      // smoothing, which this chart does not want.
      cubicInterpolationMode: "default",
      tension: 0,
      pointRadius: AXIS_POINT_RADIUS,
      pointHoverRadius: AXIS_POINT_HOVER_RADIUS,
      pointStyle: "circle",
      pointBackgroundColor: theme.value.tooltipBg,
      pointBorderColor: color,
      pointBorderWidth: 2.5,
    };
  }),
}));

const options = computed<ChartOptions<"line">>(() =>
  cartesianChartOptions<"line", "category">(theme.value, {
    interaction: { mode: "index", intersect: false },
    x: {
      type: "category",
      ticks: { ...axisTickStyle(theme.value), autoSkip: false, maxRotation: 0, minRotation: 0 },
    },
    y: {
      min: 0,
      max: AXIS_MAX,
      ticks: { ...axisTickStyle(theme.value), stepSize: AXIS_STEP, callback: tickLabel },
    },
    tooltip: {
      callbacks: {
        title: (items) => fullLabels.value[items[0]?.dataIndex ?? -1] ?? "",
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
  <Card class="h-full">
    <CardContent class="flex flex-col h-full">
      <CardHeader :title="t('intelligenceIndex')" :subtitle="t('artificialSource')" />
      <EmptyState
        v-if="rows.length === 0"
        variant="plain"
        :message="t('noRankingsData')"
        :class="cn(CHART_EMPTY_CLASS, FLEX_CHART_HEIGHT)"
      />
      <ChartFrame v-else :height="FLEX_CHART_HEIGHT">
        <ChartCanvas type="line" :data="data" :options="options" :aria-label="t('intelligenceIndex')" role="img" />
        <figcaption class="sr-only">{{ caption }}</figcaption>
      </ChartFrame>
    </CardContent>
  </Card>
</template>
