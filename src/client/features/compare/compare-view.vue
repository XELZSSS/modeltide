<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import { MODEL_SOURCES } from "@/client/config/nav-config";
import ChartCard from "@/client/components/ui/chart-card.vue";
import { RADAR_CHART_HEIGHT } from "@/client/utils/chart-metrics";
import { loadableView } from "@/client/router/lazy-view";
import ComparePageLayout from "./compare-layout.vue";

const CompareRadarChart = loadableView(() => import("./compare-radar-chart.vue"));

const { t } = useTranslation();
</script>

<template>
  <ComparePageLayout :back-to="MODEL_SOURCES.aa.backTo" :title="t('modelComparison')">
    <template #default="{ models }">
      <Suspense>
        <CompareRadarChart :models="models" />
        <template #fallback>
          <ChartCard
            loading
            class="w-full"
            content-class="h-full flex items-center justify-center"
            :skeleton-height="RADAR_CHART_HEIGHT"
          />
        </template>
      </Suspense>
    </template>
  </ComparePageLayout>
</template>
