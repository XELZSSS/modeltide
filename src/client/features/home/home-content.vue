<script setup lang="ts">
import { computed } from "vue";
import {
  useSuspenseArtificialRankingsState,
  useSuspenseClosedReleasesState,
  useSuspenseHomeDashboard,
  useSuspenseHallucinationRankings,
} from "@/client/api/api-queries";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import ChartCard from "@/client/components/ui/chart-card.vue";
import { FLEX_CHART_HEIGHT } from "@/client/components/ui/chart";
import { useTranslation } from "@/client/i18n";
import { loadableView } from "@/client/router/lazy-view";
import { useHomeStats } from "./use-home-stats";
import KpiStrip from "./home-cards.vue";
import ProviderSpeedCard from "./provider-speed-card.vue";
import TextToImageSection from "./text-to-image-section.vue";

const IndexAreaChart = loadableView(() => import("./home-charts.vue"));
const UsageDonut = loadableView(() => import("./usage-donut.vue"));
const StatisticsSection = loadableView(() => import("./statistics-section.vue"));

const { t } = useTranslation();

const artificialState = await useSuspenseArtificialRankingsState();
const hallucinationRankings = await useSuspenseHallucinationRankings();
const dashboardData = await useSuspenseHomeDashboard();
const closedReleasesState = await useSuspenseClosedReleasesState();

const artificialData = computed(() => artificialState.value.items);
const closedReleases = computed(() => closedReleasesState.value.items);

const { trendingStats, hallucinationStats, kpiStrip, providerStats, t2iModels } = useHomeStats(
  artificialData,
  hallucinationRankings,
  dashboardData,
  t,
  closedReleases,
);

const partial = computed(
  () => dashboardData.value.partial || closedReleasesState.value.partial || artificialState.value.partial,
);
</script>

<template>
  <PartialNotice v-if="partial" />

  <div class="mb-5 sm:mb-6">
    <KpiStrip :kpis="kpiStrip" />
  </div>

  <PageSection>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      <div class="lg:col-span-6">
        <Suspense>
          <IndexAreaChart :models="artificialData" />
          <template #fallback>
            <ChartCard loading :title="t('intelligenceIndex')" :subtitle="t('artificialSource')" />
          </template>
        </Suspense>
      </div>
      <div class="lg:col-span-3">
        <Suspense>
          <UsageDonut :models="dashboardData.opensource" />
          <template #fallback>
            <ChartCard
              loading
              class="h-full"
              content-class="flex flex-col h-full"
              :title="t('opensourceTaskShare')"
              :subtitle="t('openSourceDataSource')"
              :skeleton-height="FLEX_CHART_HEIGHT"
            />
          </template>
        </Suspense>
      </div>
      <div class="lg:col-span-3">
        <ProviderSpeedCard :provider-stats="providerStats" />
      </div>
    </div>
  </PageSection>

  <Suspense>
    <StatisticsSection :trending-stats="trendingStats" :hallucination-stats="hallucinationStats" />
    <template #fallback>
      <PageSection :title="t('statistics')">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard loading :title="t('openSourceTrendingStats')" :subtitle="t('huggingFaceSource')" />
          <ChartCard loading :title="t('hallucinationStats')" :subtitle="t('hallucinationSource')" />
        </div>
      </PageSection>
    </template>
  </Suspense>

  <TextToImageSection :models="t2iModels" />
</template>
