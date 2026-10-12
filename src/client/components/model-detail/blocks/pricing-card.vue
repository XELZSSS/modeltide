<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import type { ModelPricing } from "@/shared/types/catalog";
import type { EffectivePricing } from "@/shared/utils/pricing";
import { formatPricePerMillion } from "@/shared/format/money";
import InfoCard from "@/client/components/ui/info-card.vue";
import InfoRow from "@/client/components/ui/info-row.vue";
import { usePricing } from "./use-pricing";

const props = withDefaults(
  defineProps<{ pricing: ModelPricing | EffectivePricing | null | undefined; showBlended?: boolean }>(),
  { showBlended: false },
);

const { t } = useTranslation();
const { effective, blended, cacheWrite } = usePricing(() => props.pricing);
</script>

<template>
  <InfoCard :title="t('pricing')">
    <InfoRow :label="t('promptPrice')">{{ formatPricePerMillion(effective.input, t) }}</InfoRow>
    <InfoRow :label="t('completionPrice')">{{ formatPricePerMillion(effective.output, t) }}</InfoRow>
    <InfoRow :label="t('cacheHitPrice')">{{ formatPricePerMillion(effective.cacheHit, t) }}</InfoRow>
    <InfoRow v-if="cacheWrite != null" :label="t('cacheWritePrice')">
      {{ formatPricePerMillion(cacheWrite, t) }}
    </InfoRow>
    <InfoRow v-if="showBlended" :label="t('blendedPrice')">{{ formatPricePerMillion(blended, t) }}</InfoRow>
  </InfoCard>
</template>
