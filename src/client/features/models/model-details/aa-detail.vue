<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import { MODALITY_KEYS, ABSOLUTE_SCORE_BENCHMARKS, type BenchmarkKey, type ModalityKey } from "@/shared/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import {
  benchmarkLabel,
  formatBoolean,
  formatPricePerMillion,
  formatScore,
  formatTokens,
  orNA,
} from "@/client/utils/format";
import { computeBlendPrice, unclampedPercent } from "@/shared/utils";
import { getOutputSpeed } from "@/shared/utils/models";
import { resolveEffectivePricing, PRICE_LEGS } from "@/shared/utils/pricing";
import { cn } from "@/client/utils/cn";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import InfoGrid from "@/client/components/ui/info-grid.vue";
import InfoCard from "@/client/components/ui/info-card.vue";
import InfoRow from "@/client/components/ui/info-row.vue";
import Badge from "@/client/components/ui/badge.vue";
import StatCard from "@/client/components/ui/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";

const MODALITY_STYLES: Record<ModalityKey, { className: string; labelKey: TranslationKey }> = {
  text: { className: "border-accent/30 bg-accent-light text-accent", labelKey: "modalityText" },
  image: { className: "border-info/30 bg-info-light text-info", labelKey: "modalityImage" },
  speech: { className: "border-success/30 bg-success-light text-success", labelKey: "modalitySpeech" },
  video: { className: "border-warning/30 bg-warning-light text-warning", labelKey: "modalityVideo" },
};

const props = withDefaults(defineProps<{ model: ArtificialAnalysisModel; showBenchmarks?: boolean }>(), {
  showBenchmarks: true,
});

const { t } = useTranslation();

const pricing = computed(() => resolveEffectivePricing(props.model.pricing));
const blended = computed(() => computeBlendPrice(pricing.value));
const cacheWrite = computed(() => PRICE_LEGS.cacheWritePrice(pricing.value));

function modalitiesFor(prefix: "input" | "output"): ModalityKey[] {
  return MODALITY_KEYS.filter((key) =>
    Boolean(props.model[`${prefix}_modality_${key}` as keyof ArtificialAnalysisModel]),
  );
}

const inputModalities = computed(() => modalitiesFor("input"));
const outputModalities = computed(() => modalitiesFor("output"));

const hasAnyModality = computed(() =>
  MODALITY_KEYS.some((key) =>
    Boolean(
      props.model[`input_modality_${key}` as keyof ArtificialAnalysisModel] ||
      props.model[`output_modality_${key}` as keyof ArtificialAnalysisModel],
    ),
  ),
);

const scoreStats = computed<[TranslationKey, number | null | undefined][]>(() => [
  ["intelligenceIndex", props.model.intelligence_index],
  ["coding", props.model.coding_index],
  ["agentic", props.model.agentic_index],
  ["outputSpeed", getOutputSpeed(props.model)],
]);

const showBenchmarksSection = computed(
  () =>
    props.showBenchmarks &&
    props.model.benchmarks != null &&
    Object.values(props.model.benchmarks).some((v) => v != null),
);

const benchmarkStats = computed(() => {
  const benchmarks = props.model.benchmarks;
  if (!benchmarks) return [];
  return Object.entries(benchmarks)
    .map(([key, value]) => ({
      key,
      display: ABSOLUTE_SCORE_BENCHMARKS.has(key as BenchmarkKey)
        ? typeof value === "number" && Number.isFinite(value)
          ? value
          : null
        : unclampedPercent(value),
    }))
    .filter((entry) => entry.display != null);
});

function titleCaseSizeClass(s: string): string {
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
</script>

<template>
  <div class="flex flex-col gap-4">
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
    <PageSection v-if="showBenchmarksSection" :title="t('benchmarks')">
      <StatGrid :columns="4">
        <StatCard v-for="entry in benchmarkStats" :key="entry.key" :label="benchmarkLabel(entry.key, t)">
          {{ formatScore(entry.display, t) }}
        </StatCard>
      </StatGrid>
    </PageSection>
    <PageSection v-if="hasAnyModality" :title="t('modalities')">
      <div class="flex flex-col gap-4 md:flex-row md:gap-12">
        <div>
          <div class="ui-caption font-medium mb-2.5">{{ t("inputModality") }}</div>
          <div class="flex gap-2 flex-wrap">
            <Badge
              v-for="key in inputModalities"
              :key="key"
              :class="cn('px-2.5 py-1 normal-case tracking-normal', MODALITY_STYLES[key].className)"
            >
              {{ t(MODALITY_STYLES[key].labelKey) }}
            </Badge>
          </div>
        </div>
        <div>
          <div class="ui-caption font-medium mb-2.5">{{ t("outputModality") }}</div>
          <div class="flex gap-2 flex-wrap">
            <Badge
              v-for="key in outputModalities"
              :key="key"
              :class="cn('px-2.5 py-1 normal-case tracking-normal', MODALITY_STYLES[key].className)"
            >
              {{ t(MODALITY_STYLES[key].labelKey) }}
            </Badge>
          </div>
        </div>
      </div>
    </PageSection>
  </div>
</template>
