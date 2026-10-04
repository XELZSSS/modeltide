<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import {
  formatBoolean,
  formatPricePerMillion,
  formatScore,
  formatTokens,
  orNA,
} from "@/client/utils/format";
import { computeBlendPrice } from "@/shared/utils";
import { getOutputSpeed } from "@/shared/utils/models";
import { resolveEffectivePricing, PRICE_LEGS } from "@/shared/utils/pricing";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import InfoGrid from "@/client/components/ui/info-grid.vue";
import InfoCard from "@/client/components/ui/info-card.vue";
import InfoRow from "@/client/components/ui/info-row.vue";
import StatCard from "@/client/components/ui/stat-card.vue";
import AaModalities from "@/client/components/model-detail/aa-modalities.vue";
import AaBenchmarks from "@/client/components/model-detail/aa-benchmarks.vue";
import { DETAIL_BLOCK_GAP } from "@/client/config/layout";

const props = withDefaults(defineProps<{ model: ArtificialAnalysisModel; showBenchmarks?: boolean }>(), {
  showBenchmarks: true,
});

const { t } = useTranslation();

const pricing = computed(() => resolveEffectivePricing(props.model.pricing));
const blended = computed(() => computeBlendPrice(pricing.value));
const cacheWrite = computed(() => PRICE_LEGS.cacheWritePrice(pricing.value));

const scoreStats = computed<[TranslationKey, number | null | undefined][]>(() => [
  ["intelligenceIndex", props.model.intelligence_index],
  ["coding", props.model.coding_index],
  ["agentic", props.model.agentic_index],
  ["outputSpeed", getOutputSpeed(props.model)],
]);

function titleCaseSizeClass(s: string): string {
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
        <InfoRow :label="t('reasoning')">{{ formatBoolean(model.is_reasoning === true, t) }}</InfoRow>
        <InfoRow v-if="model.parameters != null" :label="t('parameters')">
          {{ formatTokens(model.parameters, t) }}
        </InfoRow>
        <InfoRow v-if="model.size_class" :label="t('sizeClass')">{{ titleCaseSizeClass(model.size_class) }}</InfoRow>
      </InfoCard>
      <InfoCard :title="t('pricing')">
        <InfoRow :label="t('promptPrice')">{{ formatPricePerMillion(PRICE_LEGS.promptPrice(pricing), t) }}</InfoRow>
        <InfoRow :label="t('completionPrice')">
          {{ formatPricePerMillion(PRICE_LEGS.completionPrice(pricing), t) }}
        </InfoRow>
        <InfoRow :label="t('cacheHitPrice')">
          {{ formatPricePerMillion(PRICE_LEGS.cacheHitPrice(pricing), t) }}
        </InfoRow>
        <InfoRow v-if="cacheWrite != null" :label="t('cacheWritePrice')">
          {{ formatPricePerMillion(cacheWrite, t) }}
        </InfoRow>
        <InfoRow :label="t('blendedPrice')">{{ formatPricePerMillion(blended, t) }}</InfoRow>
      </InfoCard>
    </InfoGrid>
    <AaBenchmarks v-if="showBenchmarks" :model="model" />
    <AaModalities :model="model" />
  </div>
</template>
