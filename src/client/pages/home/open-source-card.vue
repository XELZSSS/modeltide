<script lang="ts">
import { registerDoughnut } from "@/client/charts/register";

registerDoughnut();
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
  CHART_EMPTY_CLASS,
  FLEX_CHART_HEIGHT,
  chartBase,
  defaultTooltipOptions,
  useChartTheme,
} from "@/client/charts/theme";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import { formatPercent, formatShortNumber } from "@/shared/utils";
import { cn } from "@/client/utils/cn";
import type { HomeBarStat } from "./use-home-stats";
import RankedListRows from "./ranked-list-rows.vue";
import { OTHER_TASK_KEY, UNTAGGED_TASK_KEY, taskLabel, type TaskSlice } from "@/shared/i18n/task-labels";
import { useDevice } from "@/client/device";
import Dot from "@/client/components/ui/dot.vue";

const props = defineProps<{ tasks: TaskSlice[]; trending: HomeBarStat[] }>();

const { t } = useTranslation();
const theme = useChartTheme();
const isMobile = useDevice();
// The histogram is aggregated on the server over the full HF page; this card only draws the slices it receives.
const slices = computed(() => props.tasks);
const total = computed(() => slices.value.reduce((sum, slice) => sum + slice.total, 0));

const sliceColors = computed<string[]>(() => {
  const { donut, palette } = theme.value;
  const available = [...donut];
  for (const color of palette) if (!available.includes(color)) available.push(color);
  return slices.value.map((_, i) => available[i % available.length]!);
});

const percentOf = (part: number): string => formatPercent(total.value > 0 ? (part / total.value) * 100 : 0, t);

const sliceLabel = (slice: TaskSlice): string => {
  if (slice.key === UNTAGGED_TASK_KEY) return t("untaggedTasks");
  if (slice.key === OTHER_TASK_KEY) return t("otherTasks");
  return taskLabel(slice.key, t);
};

const data = computed<ChartData<"doughnut">>(() => ({
  labels: slices.value.map((s) => sliceLabel(s)),
  datasets: [
    {
      data: slices.value.map((s) => s.total),
      backgroundColor: sliceColors.value,
      borderColor: theme.value.tooltipBg,
      borderWidth: 2,
      // Soften the slice ends to the same 3px the bar chart uses; a square end next to the rounded dots elsewhere
      // was the last hard corner in the charts.
      borderRadius: 3,
      spacing: 1,
      hoverOffset: 0,
    },
  ],
}));

const options = computed<ChartOptions<"doughnut">>(() => ({
  ...chartBase,
  cutout: "62%",
  plugins: {
    // Seven entries squeezed into the fixed frame shrank the doughnut, so the chart never draws its own legend; the
    // tooltip names each slice and, on a phone, the list below carries colour, label and share.
    legend: { display: false },
    tooltip: {
      ...defaultTooltipOptions(theme.value),
      callbacks: {
        label: (ctx) => {
          const v = ctx.parsed;
          return `${ctx.label}: ${formatShortNumber(v, t("notAvailable"))} (${percentOf(v)})`;
        },
      },
    },
  },
}));

const caption = computed(() =>
  slices.value
    .map((s) => `${sliceLabel(s)}: ${formatShortNumber(s.total, t("notAvailable"))} (${percentOf(s.total)})`)
    .join("; "),
);
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex h-full flex-col">
      <CardHeader :title="t('openSourceTrendingStats')" :subtitle="t('huggingFaceSource')" />
      <div class="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div class="flex min-w-0 flex-col">
          <p class="mb-2 ui-caption font-medium">{{ t("opensourceTaskShare") }}</p>
          <EmptyState
            v-if="slices.length === 0"
            variant="plain"
            :message="t('notAvailable')"
            :class="cn(CHART_EMPTY_CLASS, FLEX_CHART_HEIGHT)"
          />
          <ChartFrame v-else :height="FLEX_CHART_HEIGHT">
            <ChartCanvas
              type="doughnut"
              :data="data"
              :options="options"
              :aria-label="t('opensourceTaskShare')"
              role="img"
            />
            <figcaption class="sr-only">{{ caption }}</figcaption>
          </ChartFrame>
          <!-- The mobile stand-in for the suppressed chart legend: same colour, label and share in two readable columns. -->
          <ul v-if="isMobile && slices.length > 0" class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            <li v-for="(slice, i) in slices" :key="slice.key" class="flex min-w-0 items-center gap-1.5">
              <Dot size="sm" :color="sliceColors[i]" />
              <span class="truncate ui-caption" v-tooltip="sliceLabel(slice)">{{ sliceLabel(slice) }}</span>
              <span class="ml-auto shrink-0 ui-meta tabular-nums">{{ percentOf(slice.total) }}</span>
            </li>
          </ul>
        </div>
        <div class="flex min-w-0 flex-col">
          <p class="mb-2 ui-caption font-medium">{{ t("downloads") }}</p>
          <EmptyState v-if="trending.length === 0" variant="plain" compact :message="t('notAvailable')" />
          <RankedListRows v-else :rows="trending" />
        </div>
      </div>
    </CardContent>
  </Card>
</template>
