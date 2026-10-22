<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatBoolean, formatScore, formatTokens, orNA } from "@/shared/utils";
import { titleCase } from "@/shared/utils";
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

const props = withDefaults(defineProps<{ model: ArtificialAnalysisModel; showBenchmarks?: boolean }>(), {
  showBenchmarks: true,
});

const { t } = useTranslation();

const scoreStats = computed<[TranslationKey, number | null | undefined][]>(() => [
  ["intelligenceIndex", props.model.intelligence_index],
  ["coding", props.model.coding_index],
  ["agentic", props.model.agentic_index],
  ["outputSpeed", getOutputSpeed(props.model)],
]);

function titleCaseSizeClass(s: string): string {
  return titleCase(s);
}
</script>

<template>
  <div :class="DETAIL_BLOCK_GAP">
    <StatGrid :columns="4">
      <StatCard v-for="[labelKey, value] in scoreStats" :key="labelKey" :label="t(labelKey)">
        {{ formatScore(value, t) }}
      </StatCard>
    </StatGrid>
    <InfoGrid>
      <InfoCard :title="t('modelInfo')">
        <InfoRow :label="t('creator')">{{ orNA(model.model_creators?.name, t) }}</InfoRow>
        <InfoRow :label="t('releaseDate')">{{ orNA(model.release_date, t) }}</InfoRow>
        <InfoRow :label="t('openWeights')">{{ formatBoolean(model.is_open_weights, t) }}</InfoRow>
        <InfoRow :label="t('reasoning')">{{ formatBoolean(model.is_reasoning, t) }}</InfoRow>
        <InfoRow v-if="model.parameters != null" :label="t('parameters')">
          {{ formatTokens(model.parameters, t) }}
        </InfoRow>
        <InfoRow v-if="model.size_class" :label="t('sizeClass')">{{ titleCaseSizeClass(model.size_class) }}</InfoRow>
      </InfoCard>
      <PricingCard :pricing="model.pricing" show-blended />
    </InfoGrid>
    <AaBenchmarks v-if="showBenchmarks" :model="model" />
    <AaModalities :model="model" />
  </div>
</template>
