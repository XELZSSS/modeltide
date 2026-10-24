<script lang="ts">
import { registerBar } from "@/client/charts/register";

registerBar();
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
  RANKING_CHART_HEIGHT,
  axisTickStyle,
  cartesianChartOptions,
  ceilToStep,
  seriesColor,
  useChartTheme,
} from "@/client/charts/theme";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import { formatIndex } from "@/shared/utils";
import { shortModelId } from "@/shared/utils/models";
import { FALLBACK_DASH } from "@/shared/config/ui";
import { cn } from "@/client/utils/cn";
import { useDevice } from "@/client/device";
import type { HomeChartPoint } from "@/shared/types";

const SERIES_KEYS = ["intelligence", "coding"] as const;
const SERIES_LABEL_KEYS = ["intelligence", "coding"] as const;
/** The bar is ~26px thick on a desktop card, so 3px rounds the ends without turning it into a capsule. */
const BAR_RADIUS = 3;
/**
 * Label caps, in characters. `HOME_CHART_ROWS` in src/shared/config/ui.ts fixes the category count at seven — ~81px per
 * slot on a desktop card is the largest set that still leaves a ~26px bar — and the server hands over exactly that many
 * rows. Desktop labels are trimmed to one line; phone labels tilt 45° below the axis, which costs no slot width and
 * carries more of the name. The tooltip title is always untrimmed.
 */
const AXIS_LABEL_MAX_CHARS = 15;
const MOBILE_AXIS_LABEL_MAX_CHARS = 16;

type IndexSeriesKey = (typeof SERIES_KEYS)[number];
type IndexRow = HomeChartPoint & Record<IndexSeriesKey, number>;

/** The payload arrives sliced to `HOME_CHART_ROWS` and ordered by intelligence: this drops only the rows a bar cannot draw. */
function buildIndexRows(models: readonly HomeChartPoint[]): IndexRow[] {
  return models.filter((model): model is IndexRow =>
    SERIES_KEYS.every((key) => typeof model[key] === "number" && Number.isFinite(model[key])),
  );
}

const tickLabel = (value: string | number): string => formatIndex(Number(value));

function axisLabel(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}

const props = defineProps<{ models: HomeChartPoint[] }>();

const { t } = useTranslation();
const theme = useChartTheme();
const isMobile = useDevice();
const rows = computed(() => buildIndexRows(props.models));
const fullLabels = computed(() => rows.value.map((m) => m.shortName || shortModelId(m.name) || m.id || FALLBACK_DASH));
const labels = computed(() =>
  fullLabels.value.map((label) =>
    axisLabel(label, isMobile.value ? MOBILE_AXIS_LABEL_MAX_CHARS : AXIS_LABEL_MAX_CHARS),
  ),
);

/**
 * The index is a 0..100 scale, so 100 is the floor of the value axis — but it must not also be the ceiling: a model
 * above 100 was drawn past the plot and clipped without a trace. `ceilToStep` grows the axis to the next gridline.
 */
const valueMax = computed(() =>
  ceilToStep(rows.value.reduce((peak, row) => Math.max(peak, row.intelligence, row.coding), AXIS_MAX)),
);

const data = computed<ChartData<"bar">>(() => ({
  labels: labels.value,
  datasets: SERIES_KEYS.map((key, slot) => ({
    label: t(SERIES_LABEL_KEYS[slot]!),
    data: rows.value.map((m) => m[key]),
    backgroundColor: seriesColor(theme.value, slot),
    borderRadius: BAR_RADIUS,
    borderSkipped: false,
    // Ten categories of two bars: the category band is 70% of the slot and each bar 90% of its half, which is what makes
    // the bars thick enough to read in a card this wide.
    categoryPercentage: 0.7,
    barPercentage: 0.9,
  })),
}));

const options = computed<ChartOptions<"bar">>(() =>
  cartesianChartOptions<"bar", "category">(theme.value, {
    interaction: { mode: "index", intersect: false },
    x: {
      type: "category",
      ticks: {
        ...axisTickStyle(theme.value),
        // 10px because the slot is ~60px on a desktop card: an 11-character name fits, a second tick font size does not.
        font: { size: 10 },
        autoSkip: false,
        maxRotation: isMobile.value ? 45 : 0,
        minRotation: isMobile.value ? 45 : 0,
      },
      // Category gridlines only add ten vertical rules behind ten bars.
      grid: { display: false },
    },
    y: {
      min: 0,
      max: valueMax.value,
      ticks: { ...axisTickStyle(theme.value), stepSize: AXIS_STEP, callback: tickLabel },
    },
    tooltip: {
      callbacks: {
        title: (items) => fullLabels.value[items[0]?.dataIndex ?? -1] ?? "",
        label: (ctx) => {
          // The bar's `parsed.y` is `number | null` in chart.js's own types, so the fallback branch is reachable here.
          const value = ctx.parsed.y;
          return `${ctx.dataset.label}: ${value == null ? FALLBACK_DASH : formatIndex(value)}`;
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
    <CardContent class="flex h-full flex-col">
      <CardHeader :title="t('intelligenceIndex')" :subtitle="t('artificialSource')" />
      <EmptyState
        v-if="rows.length === 0"
        variant="plain"
        :message="t('noRankingsData')"
        :class="cn(CHART_EMPTY_CLASS, RANKING_CHART_HEIGHT)"
      />
      <ChartFrame v-else :height="RANKING_CHART_HEIGHT">
        <ChartCanvas type="bar" :data="data" :options="options" :aria-label="t('intelligenceIndex')" role="img" />
        <figcaption class="sr-only">{{ caption }}</figcaption>
      </ChartFrame>
    </CardContent>
  </Card>
</template>
