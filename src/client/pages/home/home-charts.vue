<script lang="ts">
import { registerLine } from "@/client/charts/register";

registerLine();
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { ChartData, ChartOptions } from "chart.js";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import CardHeader from "@/client/components/layout/card-header.vue";
import ChartCanvas from "@/client/components/charts/chart-canvas.vue";
import ChartFrame from "@/client/components/charts/chart-frame.vue";
import {
  AXIS_MAX,
  AXIS_STEP,
  CHART_EMPTY_CLASS,
  FLEX_CHART_HEIGHT,
  axisTickStyle,
  cartesianChartOptions,
  lineSeriesStyle,
  seriesColor,
  useChartTheme,
} from "@/client/charts/theme";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import { formatIndex } from "@/shared/utils";
import { shortModelId } from "@/shared/utils/models";
import { FALLBACK_DASH } from "@/shared/config/ui";
import { cn } from "@/client/utils/cn";
import type { HomeChartPoint } from "@/shared/types";

const SERIES_KEYS = ["intelligence", "coding"] as const;
const SERIES_LABEL_KEYS = ["intelligence", "coding"] as const;
const TOP_N = 10;
const AXIS_POINT_RADIUS = 4;
const AXIS_POINT_HOVER_RADIUS = 7;

type IndexSeriesKey = (typeof SERIES_KEYS)[number];

const AXIS_LABEL_MAX_CHARS = 12;
type IndexRow = HomeChartPoint & Record<IndexSeriesKey, number>;

function buildIndexRows(models: readonly HomeChartPoint[]): IndexRow[] {
  const complete = models.filter((model): model is IndexRow =>
    SERIES_KEYS.every((key) => typeof model[key] === "number" && Number.isFinite(model[key])),
  );
  complete.sort((a, b) => b.intelligence - a.intelligence);
  return complete.slice(0, TOP_N);
}

const tickLabel = (value: string | number): string => formatIndex(Number(value));

function axisLabel(value: string): string {
  return value.length > AXIS_LABEL_MAX_CHARS ? `${value.slice(0, AXIS_LABEL_MAX_CHARS - 1)}…` : value;
}

const props = defineProps<{ models: HomeChartPoint[] }>();

const { t } = useTranslation();
const theme = useChartTheme();
const rows = computed(() => buildIndexRows(props.models));
const fullLabels = computed(() =>
  rows.value.map((m) => m.shortName || shortModelId(m.name) || m.id || FALLBACK_DASH),
);
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
      fill: false,
      ...lineSeriesStyle,
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
      // Ten long labels cannot fit a 160px-tall chart: let Chart.js drop ticks that would collide.
      // The tooltip title still carries the full model name.
      ticks: { ...axisTickStyle(theme.value), autoSkip: true, maxTicksLimit: 6, maxRotation: 0, minRotation: 0 },
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
          return `${ctx.dataset.label}: ${y == null ? FALLBACK_DASH : formatIndex(Number(y))}`;
        },
      },
    },
  }),
);

const caption = computed(() =>
  rows.value
    .map(
      (m) =>
        `${m.shortName || m.name}: ${SERIES_KEYS.map(
          (key, slot) => `${t(SERIES_LABEL_KEYS[slot]!)} ${formatIndex(m[key])}`,
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
