<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryLabel, formatPricePerMillion, formatShortNumber, formatTrend } from "@/client/utils/format";
import { PRICE_LEGS, type PriceLegId } from "@/shared/utils/pricing";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import InfoGrid from "@/client/components/ui/info-grid.vue";
import InfoCard from "@/client/components/ui/info-card.vue";
import InfoRow from "@/client/components/ui/info-row.vue";
import Badge from "@/client/components/ui/badge.vue";
import StatCard from "@/client/components/ui/stat-card.vue";

const PRICE_ROW_LEGS = ["cacheHitPrice", "promptPrice", "completionPrice"] as const satisfies readonly PriceLegId[];

const props = defineProps<{ model: OpenRouterRankEntry }>();

const { t } = useTranslation();

const showVariantBadge = computed(
  () => !!props.model.variant && props.model.variant !== "standard" && props.model.variant !== "free",
);

const pricing = computed(() => props.model.pricing);

const priceRows = computed<[TranslationKey, number | null | undefined][]>(() =>
  PRICE_ROW_LEGS.map((id) => [id, pricing.value ? PRICE_LEGS[id](pricing.value) : undefined]),
);

const cacheWrite = computed(() => (pricing.value ? PRICE_LEGS.cacheWritePrice(pricing.value) : null));

const tokenStats = computed<[TranslationKey, string][]>(() => [
  ["inputTokens", formatShortNumber(props.model.promptTokens, t("notAvailable"))],
  ["outputTokens", formatShortNumber(props.model.completionTokens, t("notAvailable"))],
]);
</script>

<template>
  <div class="flex flex-col gap-4">
    <StatGrid :columns="4">
      <StatCard :label="t('creator')">{{ model.creator }}</StatCard>
      <StatCard v-for="[labelKey, value] in tokenStats" :key="labelKey" :label="t(labelKey)">{{ value }}</StatCard>
      <StatCard v-if="model.reasoningTokens != null" :label="t('reasoningTokens')">
        {{ formatShortNumber(model.reasoningTokens, t("notAvailable")) }}
      </StatCard>
      <StatCard v-else :label="t('category')">{{ categoryLabel(model.category, t) }}</StatCard>
    </StatGrid>
    <InfoGrid>
      <InfoCard :title="t('modelInfo')">
        <InfoRow :label="t('apiModelId')">
          <code class="font-mono text-xs bg-bg-secondary px-1.5 py-0.5">{{ model.id }}</code>
        </InfoRow>
        <InfoRow :label="t('category')">{{ categoryLabel(model.category, t) }}</InfoRow>
        <InfoRow :label="t('trend')">{{ formatTrend(model.change, t) }}</InfoRow>
        <InfoRow :label="t('totalTokens')">
          {{ formatShortNumber(model.totalTokens, t("notAvailable")) }}
        </InfoRow>
        <InfoRow v-if="model.cachedTokens != null" :label="t('cachedTokens')">
          {{ formatShortNumber(model.cachedTokens, t("notAvailable")) }}
        </InfoRow>
        <InfoRow v-if="model.toolCalls != null" :label="t('toolCalls')">
          {{ formatShortNumber(model.toolCalls, t("notAvailable")) }}
        </InfoRow>
      </InfoCard>
      <InfoCard :title="t('pricing')">
        <InfoRow v-for="[labelKey, value] in priceRows" :key="labelKey" :label="t(labelKey)">
          {{ formatPricePerMillion(value, t) }}
        </InfoRow>
        <InfoRow v-if="cacheWrite != null" :label="t('cacheWritePrice')">
          {{ formatPricePerMillion(cacheWrite, t) }}
        </InfoRow>
      </InfoCard>
    </InfoGrid>
    <div v-if="showVariantBadge || model.isFree" class="flex flex-wrap gap-2">
      <Badge v-if="showVariantBadge">{{ model.variant }}</Badge>
      <Badge v-if="model.isFree" class="text-success">{{ t("free") }}</Badge>
    </div>
  </div>
</template>
