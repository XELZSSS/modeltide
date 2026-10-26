<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryLabel, formatDate, formatPricePerMillion, formatShortNumber, formatTrend, orNA } from "@/shared/utils";
import { PRICE_LEGS, type PriceLegId } from "@/shared/utils/pricing";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import InfoGrid from "@/client/components/layout/info-grid.vue";
import InfoCard from "@/client/components/layout/info-card.vue";
import InfoRow from "@/client/components/layout/info-row.vue";
import Badge from "@/client/components/ui/badge.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import { trendClass } from "@/client/components/table/table-columns.ts";
import { cn } from "@/client/utils/cn";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";

const PRICE_ROW_LEGS = ["cacheHitPrice", "promptPrice", "completionPrice"] as const satisfies readonly PriceLegId[];

const props = defineProps<{ model: OpenRouterRankEntry }>();

const { t, lang } = useTranslation();

const showVariantBadge = computed(
  () => !!props.model.variant && props.model.variant !== "standard" && props.model.variant !== "free",
);

const pricing = computed(() => props.model.pricing);

const priceRows = computed<[TranslationKey, number | null | undefined][]>(() =>
  PRICE_ROW_LEGS.map((id) => [id, pricing.value ? PRICE_LEGS[id](pricing.value) : undefined]),
);

const cacheWrite = computed(() => (pricing.value ? PRICE_LEGS.cacheWritePrice(pricing.value) : null));

/**
 * Headline numbers only, taken from the same columns the usage ranking prints: a creator name and a category label sat
 * here before, which made two of the four "stats" text — and the category then appeared a second time in the info card
 * below. The text facts live in that card; the row counts.
 */
const usageStats = computed<[TranslationKey, string][]>(() => [
  ["totalTokens", formatShortNumber(props.model.totalTokens, t("notAvailable"))],
  ["inputTokens", formatShortNumber(props.model.promptTokens, t("notAvailable"))],
  ["outputTokens", formatShortNumber(props.model.completionTokens, t("notAvailable"))],
  ["requests", formatShortNumber(props.model.requestCount, t("notAvailable"))],
]);
</script>

<template>
  <div :class="DETAIL_BLOCK_GAP">
    <StatGrid :columns="4">
      <StatCard v-for="[labelKey, value] in usageStats" :key="labelKey" :label="t(labelKey)">{{ value }}</StatCard>
    </StatGrid>
    <InfoGrid>
      <InfoCard :title="t('modelInfo')">
        <InfoRow :label="t('apiModelId')">{{ model.id }}</InfoRow>
        <InfoRow :label="t('creator')">{{ orNA(model.creator, t) }}</InfoRow>
        <InfoRow :label="t('category')">{{ categoryLabel(model.category, t) }}</InfoRow>
        <InfoRow :label="t('trend')">
          <span :class="cn(trendClass(model.change))">{{ formatTrend(model.change, t) }}</span>
        </InfoRow>
        <InfoRow v-if="model.expiresAt" :label="t('expiresAt')">{{ formatDate(model.expiresAt, lang) }}</InfoRow>
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
      <Badge v-if="showVariantBadge">
        <span class="min-w-0 break-words whitespace-normal md:truncate" v-tooltip="model.variant">{{
          model.variant
        }}</span>
      </Badge>
      <Badge v-if="model.isFree" class="text-success">{{ t("free") }}</Badge>
    </div>
  </div>
</template>
