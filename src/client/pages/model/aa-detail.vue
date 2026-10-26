<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { BenchmarkKey } from "@/shared/config";
import { formatBoolean, formatDate, formatScore, formatSpeed, formatTokens, orNA, titleCase } from "@/shared/utils";
import { getOutputSpeed } from "@/shared/utils/models";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import InfoGrid from "@/client/components/layout/info-grid.vue";
import InfoCard from "@/client/components/layout/info-card.vue";
import InfoRow from "@/client/components/layout/info-row.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import AaModalities from "./aa-modalities.vue";
import AaBenchmarks from "./aa-benchmarks.vue";
import PricingCard from "./pricing-card.vue";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";

const props = withDefaults(
  defineProps<{
    model: ArtificialAnalysisModel;
    showBenchmarks?: boolean;
    /** Benchmark keys the calling page already prints, so the grid does not print them a second time. */
    omitBenchmarks?: readonly BenchmarkKey[];
  }>(),
  { showBenchmarks: true, omitBenchmarks: () => [] },
);

const { t, lang } = useTranslation();

/**
 * The four numbers this page leads with. The three indices go through `formatScore` and carry the "index" unit: they are
 * 0-100 indices — the upstream's own scale for `intelligence_index`, and the one the OpenRouter directory files
 * `codingIndex` / `agenticIndex` on — never percentages. Speed carries the unit the home provider card prints, because a
 * bare "2658" beside three indices otherwise reads as a fourth index.
 */
const speedText = computed(() => {
  const speed = getOutputSpeed(props.model);
  return speed == null ? t("notAvailable") : `${formatSpeed(speed, t)} ${t("tokensPerSecond")}`;
});

const scoreStats = computed<[TranslationKey, string][]>(() => [
  ["intelligenceIndex", formatScore(props.model.intelligence_index, t)],
  ["coding", formatScore(props.model.coding_index, t)],
  ["agentic", formatScore(props.model.agentic_index, t)],
  ["outputSpeed", speedText.value],
]);
</script>

<template>
  <div :class="DETAIL_BLOCK_GAP">
    <StatGrid :columns="4">
      <StatCard v-for="[labelKey, value] in scoreStats" :key="labelKey" :label="t(labelKey)">{{ value }}</StatCard>
    </StatGrid>
    <InfoGrid>
      <InfoCard :title="t('modelInfo')">
        <InfoRow :label="t('creator')">{{ orNA(model.model_creators?.name, t) }}</InfoRow>
        <InfoRow :label="t('releaseDate')">{{
          model.release_date ? formatDate(model.release_date, lang) : t("notAvailable")
        }}</InfoRow>
        <InfoRow :label="t('openWeights')">{{ formatBoolean(model.is_open_weights, t) }}</InfoRow>
        <InfoRow :label="t('reasoning')">{{ formatBoolean(model.is_reasoning, t) }}</InfoRow>
        <InfoRow v-if="model.parameters != null" :label="t('parameters')">
          {{ formatTokens(model.parameters, t) }}
        </InfoRow>
        <InfoRow v-if="model.size_class" :label="t('sizeClass')">{{ titleCase(model.size_class) }}</InfoRow>
        <InfoRow v-if="model.context_window_tokens != null" :label="t('contextWindow')">
          {{ formatTokens(model.context_window_tokens, t) }}
        </InfoRow>
        <InfoRow :label="t('slug')">{{ model.slug }}</InfoRow>
      </InfoCard>
      <PricingCard :pricing="model.pricing" show-blended />
    </InfoGrid>
    <AaBenchmarks v-if="showBenchmarks" :model="model" :omit="omitBenchmarks" />
    <AaModalities :model="model" />
  </div>
</template>
