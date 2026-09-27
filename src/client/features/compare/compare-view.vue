<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import { MODEL_SOURCES } from "@/client/config/nav-config";
import ChartCard from "@/client/components/ui/chart-card.vue";
import { loadableView } from "@/client/router/lazy-view";
import ComparePageLayout from "./compare-layout.vue";

const CompareRadarChart = loadableView(() => import("./compare-radar-chart.vue"));
const CompareButterflyChart = loadableView(() => import("./compare-butterfly-chart.vue"));

const { t } = useTranslation();
</script>

<template>
  <ComparePageLayout :back-to="MODEL_SOURCES.aa.backTo" :title="t('modelComparison')">
    <template #default="{ models }">
      <div class="flex flex-col md:flex-row gap-4 sm:gap-6 md:items-stretch">
        <Suspense>
          <CompareRadarChart :models="models" />
          <template #fallback>
            <ChartCard
              loading
              class="w-full md:w-1/2"
              content-class="h-full flex items-center justify-center"
              skeleton-height="h-[240px] sm:h-[320px]"
            />
          </template>
        </Suspense>
        <Suspense>
          <CompareButterflyChart :models="models" />
          <template #fallback>
            <ChartCard
              loading
              :title="t('compareValues')"
              class="w-full md:w-1/2"
              content-class="h-full"
              skeleton-height="h-[240px] sm:h-[300px]"
            />
          </template>
        </Suspense>
      </div>
    </template>
  </ComparePageLayout>
</template>
