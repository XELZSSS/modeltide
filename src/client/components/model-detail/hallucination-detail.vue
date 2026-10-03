<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel, HallucinationRankingEntry } from "@/shared/types";
import { formatIndex, formatPercent } from "@/client/utils/format";
import { normalizeModelKey } from "@/shared/utils";
import { useSuspenseArtificialRankings, useSuspenseHallucinationRankings } from "@/client/api/api-queries";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import InfoCard from "@/client/components/ui/info-card.vue";
import InfoRow from "@/client/components/ui/info-row.vue";
import StatCard from "@/client/components/ui/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import NotFound from "@/client/components/feedback/not-found.vue";
import ModelDetailContent from "@/client/components/model-detail/aa-detail.vue";
import DetailShell, { findModel } from "@/client/components/model-detail/detail-views.vue";

function indexAaModels(models: ArtificialAnalysisModel[]): Map<string, ArtificialAnalysisModel[]> {
  const index = new Map<string, ArtificialAnalysisModel[]>();
  for (const model of models) {
    for (const value of [model.name, model.short_name, model.slug]) {
      if (!value) continue;
      const key = normalizeModelKey(value);
      const bucket = index.get(key);
      if (bucket) bucket.push(model);
      else index.set(key, [model]);
    }
  }
  return index;
}

function findAaModelForHall(
  aaIndex: Map<string, ArtificialAnalysisModel[]>,
  entry: HallucinationRankingEntry,
): ArtificialAnalysisModel | undefined {
  const candidates = new Set<ArtificialAnalysisModel>();
  for (const value of [entry.model, entry.slug]) {
    if (!value) continue;
    for (const model of aaIndex.get(normalizeModelKey(value)) ?? []) candidates.add(model);
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}

const props = defineProps<{ decodedId: string }>();

const { t } = useTranslation();

const [aaData, hallucinationRankings] = await Promise.all([
  useSuspenseArtificialRankings(),
  useSuspenseHallucinationRankings(),
]);

const entry = computed(() => findModel(hallucinationRankings.value, props.decodedId, "id", "slug"));
const directAa = computed(() => findModel(aaData.value, props.decodedId, "id", "slug"));
const fallbackAa = computed(() =>
  !directAa.value && entry.value ? findAaModelForHall(indexAaModels(aaData.value), entry.value) : undefined,
);
const aaModel = computed(() => directAa.value ?? fallbackAa.value);

const hallStats = computed<[TranslationKey, string][]>(() =>
  entry.value
    ? [
        ["omniscienceIndex", formatIndex(entry.value.omniscienceIndex, t("notAvailable"))],
        ["accuracy", formatPercent(entry.value.accuracy, t)],
        ["hallucinationRate", formatPercent(entry.value.hallucinationRate, t)],
        ["attemptRate", formatPercent(entry.value.attemptRate, t)],
      ]
    : [],
);
</script>

<template>
  <NotFound v-if="!entry" />
  <DetailShell v-else source="hall" :title="entry.model">
    <div class="flex flex-col gap-4">
      <StatGrid :columns="4">
        <StatCard v-for="[labelKey, value] in hallStats" :key="labelKey" :label="t(labelKey)">{{ value }}</StatCard>
      </StatGrid>
      <InfoCard :title="t('modelInfo')">
        <InfoRow :label="t('modelNameOrId')">{{ entry.model }}</InfoRow>
        <InfoRow :label="t('slug')">{{ entry.slug }}</InfoRow>
        <InfoRow v-if="aaModel?.model_creators?.name" :label="t('creator')">
          {{ aaModel.model_creators.name }}
        </InfoRow>
        <InfoRow v-if="aaModel?.release_date" :label="t('releaseDate')">{{ aaModel.release_date }}</InfoRow>
      </InfoCard>
      <PageSection v-if="aaModel" :title="t('modelDetail')">
        <ModelDetailContent :model="aaModel" />
      </PageSection>
    </div>
  </DetailShell>
</template>
