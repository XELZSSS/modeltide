<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseHomeDashboard } from "@/client/api/view-models";
import { useMalformedGuard } from "@/client/hooks/use-malformed-guard";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import { loadableView } from "@/client/router/lazy-view";
import { useTranslation } from "@/client/i18n";
import { staggerStyle } from "@/client/motion";
import { useHomeStats } from "./use-home-stats";
import ProviderSpeedCard from "./provider-speed-card.vue";
import HallucinationCard from "./hallucination-card.vue";
import TextToImageSection from "./text-to-image-section.vue";

const IndexRankingChart = loadableView(() => import("./home-charts.vue"));
const OpenSourceCard = loadableView(() => import("./open-source-card.vue"));

const { t } = useTranslation();

const dashboardData = await useSuspenseHomeDashboard();

useMalformedGuard(() => dashboardData.value.malformed, "homeDashboard");

const { trendingStats, hallucinationStats, providerStats, t2iModels } = useHomeStats(dashboardData, t);

const partial = computed(() => dashboardData.value.partial);
</script>

<template>
  <PartialNotice v-if="partial" />
  <p class="mb-3 ui-meta">{{ t("dataDisclaimer") }}</p>

  <div class="grid grid-cols-1 items-stretch gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12">
    <div class="ui-anim-rise md:col-span-2 lg:col-span-6" :style="staggerStyle(0)">
      <IndexRankingChart :models="dashboardData.chart" />
    </div>
    <div class="ui-anim-rise md:col-span-2 lg:col-span-6" :style="staggerStyle(1)">
      <OpenSourceCard :tasks="dashboardData.openSourceTasks" :trending="trendingStats" />
    </div>
    <div class="ui-anim-rise lg:col-span-4" :style="staggerStyle(2)">
      <ProviderSpeedCard :provider-stats="providerStats" />
    </div>
    <div class="ui-anim-rise lg:col-span-4" :style="staggerStyle(3)">
      <HallucinationCard :rows="hallucinationStats" />
    </div>
    <div class="ui-anim-rise md:col-span-2 lg:col-span-4" :style="staggerStyle(4)">
      <TextToImageSection :models="t2iModels" />
    </div>
  </div>
</template>
