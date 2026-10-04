<script lang="ts">
import { registerDoughnut } from "@/client/utils/charts-register";

registerDoughnut();
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { ChartData, ChartOptions } from "chart.js";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import ChartCanvas from "@/client/components/ui/chart-canvas.vue";
import ChartFrame from "@/client/components/ui/chart-frame.vue";
import { CHART_EMPTY_CLASS, FLEX_CHART_HEIGHT } from "@/client/utils/chart-metrics";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useTranslation } from "@/client/i18n";
import { formatShortNumber } from "@/client/utils/format";
import { cn } from "@/client/utils/cn";
import { useChartTheme, legendStyle } from "@/client/theme/chart-theme";
import { chartBase, defaultTooltipOptions } from "@/client/utils/charts";
import type { TFunction, TranslationKey } from "@/shared/i18n";
import type { HomeBarStat } from "./use-home-stats";

const TASK_SLICE_LIMIT = 5;
const OTHER_TASK_KEY = "__other__";

interface TaskSlice {
  key: string;
  total: number;
}

const TASK_LABEL_KEYS: Record<string, TranslationKey> = {
  "text-generation": "taskTextGeneration",
  "text-to-image": "taskTextToImage",
  "image-text-to-text": "taskImageTextToText",
  "image-to-image": "taskImageToImage",
  "automatic-speech-recognition": "taskSpeechRecognition",
  "text-to-speech": "taskTextToSpeech",
  "text-to-video": "taskTextToVideo",
  "video-text-to-text": "taskVideoTextToText",
  "image-classification": "taskImageClassification",
  "object-detection": "taskObjectDetection",
  "text-classification": "taskTextClassification",
  translation: "taskTranslation",
  summarization: "taskSummarization",
  "question-answering": "taskQuestionAnswering",
};

function formatTaskLabel(task: string): string {
  return task
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function taskLabel(task: string, t: TFunction): string {
  const key = TASK_LABEL_KEYS[task];
  return key ? t(key) : formatTaskLabel(task);
}

function aggregateTaskShare(models: { task: string | null | undefined }[]): {
  slices: TaskSlice[];
  total: number;
} {
  const counts = new Map<string, number>();
  let other = 0;
  for (const model of models) {
    const task = typeof model.task === "string" ? model.task.trim() : "";
    if (!task) {
      other += 1;
      continue;
    }
    counts.set(task, (counts.get(task) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  let total = other;
  const slices: TaskSlice[] = ranked.slice(0, TASK_SLICE_LIMIT).map(([key, count]) => {
    total += count;
    return { key, total: count };
  });
  const tailTotal = ranked.slice(TASK_SLICE_LIMIT).reduce((sum, [, count]) => sum + count, 0);
  total += tailTotal;
  if (tailTotal > 0) slices.push({ key: OTHER_TASK_KEY, total: tailTotal });
  return { slices, total };
}

const props = defineProps<{ models: { task: string | null | undefined }[]; trending: HomeBarStat[] }>();

const { t } = useTranslation();
const theme = useChartTheme();
const aggregated = computed(() => aggregateTaskShare(props.models));
const slices = computed(() => aggregated.value.slices);
const total = computed(() => aggregated.value.total);

const sliceLabel = (slice: TaskSlice): string =>
  slice.key === OTHER_TASK_KEY ? t("otherTasks") : taskLabel(slice.key, t);

const data = computed<ChartData<"doughnut">>(() => ({
  labels: slices.value.map((s) => sliceLabel(s)),
  datasets: [
    {
      data: slices.value.map((s) => s.total),
      backgroundColor: slices.value.map((_, i) => theme.value.donut[i % theme.value.donut.length]!),
      borderColor: theme.value.tooltipBg,
      borderWidth: 2,
      borderRadius: 0,
      spacing: 1,
      hoverOffset: 0,
    },
  ],
}));

const options = computed<ChartOptions<"doughnut">>(() => ({
  ...chartBase,
  cutout: "62%",
  plugins: {
    legend: { ...legendStyle(theme.value), position: "bottom" as const },
    tooltip: {
      ...defaultTooltipOptions(theme.value),
      callbacks: {
        label: (ctx) => {
          const v = typeof ctx.parsed === "number" ? ctx.parsed : 0;
          const pct = total.value > 0 ? ((v / total.value) * 100).toFixed(1) : "0.0";
          return `${ctx.label}: ${formatShortNumber(v, t("notAvailable"))} (${pct}%)`;
        },
      },
    },
  },
}));

const caption = computed(() =>
  slices.value
    .map((s) => {
      const pct = total.value > 0 ? ((s.total / total.value) * 100).toFixed(1) : "0.0";
      return `${sliceLabel(s)}: ${formatShortNumber(s.total, t("notAvailable"))} (${pct}%)`;
    })
    .join(""),
);
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex flex-col h-full">
      <CardHeader :title="t('openSourceTrendingStats')" :subtitle="t('huggingFaceSource')" />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 flex-1 min-w-0">
        <div class="flex flex-col min-w-0">
          <p class="ui-caption mb-2">{{ t("opensourceTaskShare") }}</p>
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
        </div>
        <div class="flex flex-col min-w-0">
          <p class="ui-caption mb-2">{{ t("downloads") }}</p>
          <EmptyState v-if="trending.length === 0" variant="plain" compact :message="t('notAvailable')" />
          <div v-else class="flex flex-1 flex-col gap-1 justify-between">
            <div
              v-for="(row, i) in trending"
              :key="`${row.label}#${i + 1}`"
              class="flex h-9 items-center gap-3 min-w-0"
            >
              <span class="text-xs font-medium text-text-tertiary w-6 text-center shrink-0 tabular-nums">
                {{ i + 1 }}
              </span>
              <span class="text-sm truncate min-w-0 flex-1">{{ row.label }}</span>
              <span class="ui-mono-value shrink-0">{{ row.valueLabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
