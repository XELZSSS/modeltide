<script setup lang="ts">
import { computed, watch } from "vue";
import {
  useSuspenseArtificialRankingsState,
  useSuspenseClosedReleasesState,
  useSuspenseHomeDashboard,
  useSuspenseHallucinationRankings,
} from "@/client/api/hooks";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import { loadableView } from "@/client/router/lazy-view";
import { useTranslation } from "@/client/i18n";
import { staggerStyle } from "@/client/motion";
import { useHomeStats } from "./use-home-stats";
import ProviderSpeedCard from "./provider-speed-card.vue";
import HallucinationCard from "./hallucination-card.vue";
import TextToImageSection from "./text-to-image-section.vue";

const IndexAreaChart = loadableView(() => import("./home-charts.vue"));
const OpenSourceCard = loadableView(() => import("./open-source-card.vue"));

const { t } = useTranslation();

const [artificialState, hallucinationRankings, dashboardData, closedReleasesState] = await Promise.all([
  useSuspenseArtificialRankingsState(),
  useSuspenseHallucinationRankings(),
  useSuspenseHomeDashboard(),
  useSuspenseClosedReleasesState(),
]);
watch(
  () => artificialState.value.malformed || closedReleasesState.value.malformed || dashboardData.value.malformed,
  () => {
    assertPayloadShape(artificialState.value.malformed, "artificialIndex");
    assertPayloadShape(closedReleasesState.value.malformed, "closedReleases");
    assertPayloadShape(dashboardData.value.malformed, "homeDashboard");
  },
  { immediate: true },
);
const artificialData = computed(() => artificialState.value.items);

const { trendingStats, hallucinationStats, providerStats, t2iModels } = useHomeStats(
  artificialData,
  hallucinationRankings,
  dashboardData,
  t,
);

const partial = computed(
  () =>
    dashboardData.value.partial ||
    closedReleasesState.value.partial ||
    artificialState.value.partial ||
    closedReleasesState.value.malformed ||
    artificialState.value.malformed,
);
</script>

<template>
  <PartialNotice v-if="partial" />

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-stretch">
    <div class="md:col-span-2 lg:col-span-6 ui-anim-rise" :style="staggerStyle(0)">
      <IndexAreaChart :models="artificialData" />
    </div>
    <div class="md:col-span-2 lg:col-span-6 ui-anim-rise" :style="staggerStyle(1)">
      <OpenSourceCard :models="dashboardData.opensource" :trending="trendingStats" />
    </div>
    <div class="lg:col-span-4 ui-anim-rise" :style="staggerStyle(2)">
      <ProviderSpeedCard :provider-stats="providerStats" />
    </div>
    <div class="lg:col-span-4 ui-anim-rise" :style="staggerStyle(3)">
      <HallucinationCard :rows="hallucinationStats" />
    </div>
    <div class="md:col-span-2 lg:col-span-4 ui-anim-rise" :style="staggerStyle(4)">
      <TextToImageSection :models="t2iModels" />
    </div>
  </div>
</template>
