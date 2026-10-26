<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { SOURCES } from "@/client/nav/sources";
import { loadableView } from "@/client/router/lazy-view";
import { formatScore } from "@/shared/utils";
import CompareTable from "./compare-table.vue";
import ComparePageLayout from "./compare-layout.vue";
import { buildMetricRows } from "@/client/utils/compare-logic";
import { makeWinnerRenderer } from "./winner-renderer";

const CompareRadarChart = loadableView(() => import("./compare-radar-chart.vue"));

const { t } = useTranslation();

const metricRows = computed(() => buildMetricRows(t));

/**
 * One cell of the metric matrix. A missing index stays blank instead of reading as 0 — the two mean different things —
 * and the winner marks only appear on rows where at least two models carry a number.
 */
const renderMetric = makeWinnerRenderer(t, (value) => formatScore(value, t));
</script>

<template>
  <ComparePageLayout :back-to="SOURCES.aa.backTo" :title="t('modelComparison')">
    <template #default="{ models }">
      <div class="flex min-w-0 flex-col gap-4">
        <CompareRadarChart :models="models" />
        <!-- The radar draws the shape of the comparison; this is the same metrics as numbers, which is what a reader
             comparing two models has to check. -->
        <CompareTable :rows="metricRows" :models="models" :render-value="renderMetric" />
      </div>
    </template>
  </ComparePageLayout>
</template>
