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
import { isFiniteNumber } from "@/shared/utils/number";
import { shortModelId } from "@/shared/utils/models";
import { FALLBACK_DASH } from "@/shared/config/ui";
import { cn } from "@/client/utils/cn";
import { useDevice } from "@/client/device";
import type { HomeChartPoint } from "@/shared/types";

/** A bar is ~60px thick in the wide card, so 3px rounds the ends without turning it into a capsule. */
const BAR_RADIUS = 3;
/**
 * Label caps, in characters. `HOME_CHART_ROWS` in src/shared/config/ui.ts fixes the category count at fourteen: the card
 * spans the page column, which leaves each slot ~100px on a wide screen and ~24px on a phone, and the server hands over
 * exactly that many rows. Desktop labels are trimmed to one line; phone labels tilt 45° below the axis, which costs no
 * slot width and carries more of the name. The tooltip title is always untrimmed.
 */
const AXIS_LABEL_MAX_CHARS = 15;
const MOBILE_AXIS_LABEL_MAX_CHARS = 16;
/** How many of the fourteen rows a phone's slot width can carry without the tilted labels touching. */
const PHONE_ROWS = 7;
const tickLabel = (value: string | number): string => formatIndex(Number(value));

function axisLabel(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}

const props = defineProps<{ models: HomeChartPoint[] }>();

const { t } = useTranslation();
const theme = useChartTheme();
const isMobile = useDevice();
/**
 * The card's rows. The index carries one 0-100 score per row and a row without it is the only row this card drops; the
 * payload carries fourteen rows, and a phone draws the first seven — fourteen labels tilted 45° across 390px collide,
 * where the same card on a desktop has a slot of ~100px for all fourteen.
 */
const rows = computed(() =>
  props.models.filter((model) => isFiniteNumber(model.score)).slice(0, isMobile.value ? PHONE_ROWS : undefined),
);
const fullLabels = computed(() => rows.value.map((m) => shortModelId(m.name) || m.id || FALLBACK_DASH));
const labels = computed(() =>
  fullLabels.value.map((label) =>
    axisLabel(label, isMobile.value ? MOBILE_AXIS_LABEL_MAX_CHARS : AXIS_LABEL_MAX_CHARS),
  ),
);

/**
 * The intelligence index is a 0..100 scale, so 100 is the floor of the value axis — but it must not also be the ceiling:
 * a score above 100 was drawn past the plot and clipped without a trace. `ceilToStep` grows the axis to the gridline.
 */
const valueMax = computed(() => ceilToStep(rows.value.reduce((peak, row) => Math.max(peak, row.score), AXIS_MAX)));

const data = computed<ChartData<"bar">>(() => ({
  labels: labels.value,
  datasets: [
    {
      label: t("score"),
      data: rows.value.map((m) => m.score),
      backgroundColor: seriesColor(theme.value, 0),
      borderRadius: BAR_RADIUS,
      borderSkipped: false,
      // Fourteen categories of one bar: the category band is 70% of the slot and the bar 90% of it, which is what makes a
      // bar thick enough to read in a card this wide.
      categoryPercentage: 0.7,
      barPercentage: 0.9,
    },
  ],
}));

const options = computed<ChartOptions<"bar">>(() =>
  cartesianChartOptions<"bar", "category">(theme.value, {
    interaction: { mode: "index", intersect: false },
    x: {
      type: "category",
      ticks: {
        ...axisTickStyle(theme.value),
        // 10px because the slot is ~100px on a desktop card: a 15-character name fits, a second tick font size does not.
        font: { size: 10 },
        autoSkip: false,
        maxRotation: isMobile.value ? 45 : 0,
        minRotation: isMobile.value ? 45 : 0,
      },
      // Category gridlines only add fourteen vertical rules behind fourteen bars.
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

const caption = computed(() => rows.value.map((m) => `${m.name}: ${formatIndex(m.score)}`).join("; "));
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
