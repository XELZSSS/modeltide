<script setup lang="ts">
import { computed } from "vue";
import {
  useSuspenseArtificialRankingsState,
  useSuspenseClosedReleasesState,
  useSuspenseHomeDashboard,
  useSuspenseHallucinationRankings,
} from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import ChartCard from "@/client/components/ui/chart-card.vue";
import { FLEX_CHART_HEIGHT } from "@/client/utils/chart-metrics";
import { useTranslation } from "@/client/i18n";
import { loadableView } from "@/client/router/lazy-view";
import { useHomeStats } from "./use-home-stats";
import ProviderSpeedCard from "./provider-speed-card.vue";
import HallucinationCard from "./hallucination-card.vue";
import TextToImageSection from "./text-to-image-section.vue";

const IndexAreaChart = loadableView(() => import("./home-charts.vue"));
const OpenSourceCard = loadableView(() => import("./open-source-card.vue"));

const { t } = useTranslation();

const artificialState = await useSuspenseArtificialRankingsState();
assertPayloadShape(artificialState.value.malformed, "artificialIndex");
const hallucinationRankings = await useSuspenseHallucinationRankings();
const dashboardData = await useSuspenseHomeDashboard();
const closedReleasesState = await useSuspenseClosedReleasesState();
assertPayloadShape(closedReleasesState.value.malformed, "closedReleases");
const artificialData = computed(() => artificialState.value.items);

const { trendingStats, hallucinationStats, providerStats, t2iModels } = useHomeStats(
  artificialData,
  hallucinationRankings,
  dashboardData,
  t,
);

const partial = computed(
  () => dashboardData.value.partial || closedReleasesState.value.partial || artificialState.value.partial,
);
</script>

<template>
  <PartialNotice v-if="partial" />

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-stretch">
    <div class="md:col-span-2 lg:col-span-6">
      <Suspense>
        <IndexAreaChart :models="artificialData" />
        <template #fallback>
          <ChartCard
            loading
            class="h-full"
            :title="t('intelligenceIndex')"
            :subtitle="t('artificialSource')"
            :skeleton-height="FLEX_CHART_HEIGHT"
          />
        </template>
      </Suspense>
    </div>
    <div class="md:col-span-2 lg:col-span-6">
      <Suspense>
        <OpenSourceCard :models="dashboardData.opensource" :trending="trendingStats" />
        <template #fallback>
          <ChartCard
            loading
            class="h-full"
            content-class="flex flex-col h-full"
            :title="t('openSourceTrendingStats')"
            :subtitle="t('huggingFaceSource')"
            :skeleton-height="FLEX_CHART_HEIGHT"
          />
        </template>
      </Suspense>
    </div>
    <div class="lg:col-span-4">
      <ProviderSpeedCard :provider-stats="providerStats" />
    </div>
    <div class="lg:col-span-4">
      <HallucinationCard :rows="hallucinationStats" />
    </div>
    <div class="md:col-span-2 lg:col-span-4">
      <TextToImageSection :models="t2iModels" />
    </div>
  </div>
</template>
