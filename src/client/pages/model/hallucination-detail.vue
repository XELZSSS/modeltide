<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import { formatIndex, formatPercent } from "@/shared/utils";
import { useSuspenseArtificialRankingsState } from "@/client/api/hooks";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import InfoCard from "@/client/components/layout/info-card.vue";
import InfoRow from "@/client/components/layout/info-row.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";
import ModelMiss from "@/client/components/feedback/model-miss.vue";
import { useSoftNotFound } from "@/client/router/document-meta";
import ModelDetailContent from "./aa-detail.vue";
import DetailShell, { findModel } from "./detail-views.vue";

const props = defineProps<{ decodedId: string }>();

const { t } = useTranslation();

// The AA index is the only payload this page reads, so it answers two different questions: whether the model exists,
// and whether the omniscience evaluation has scored it yet. Looking the model up in the *derived* ranking list instead
// answered both with one lookup, which reported every model the evaluation has not reached as "not found".
const aaState = await useSuspenseArtificialRankingsState();
const model = computed(() => findModel(aaState.value.items, props.decodedId, "id", "slug"));

useSoftNotFound(computed(() => !model.value && !aaState.value.partial));

const hallStats = computed<[TranslationKey, string][]>(() => {
  const total = model.value?.omniscience_breakdown?.total;
  const score = total?.omniscience;
  // `omniscience` is the field the evaluation always writes and the one this page plots; the other three are optional
  // and `formatPercent` renders those as N/A. No score means the evaluation has not reached this model yet.
  if (!total || score == null) return [];
  return [
    ["omniscienceIndex", formatIndex(score, t("notAvailable"))],
    ["accuracy", formatPercent(total.accuracy, t)],
    ["hallucinationRate", formatPercent(total.hallucination_rate, t)],
    ["attemptRate", formatPercent(total.attempt_rate, t)],
  ];
});
</script>

<template>
  <ModelMiss v-if="!model" :partial="aaState.partial" />
  <DetailShell v-else source="hall" :title="model.name">
    <div :class="DETAIL_BLOCK_GAP">
      <PartialNotice v-if="aaState.partial" />
      <EmptyState v-if="hallStats.length === 0" variant="error" :message="t('rankingsUnavailable')" />
      <StatGrid v-else :columns="4">
        <StatCard v-for="[labelKey, value] in hallStats" :key="labelKey" :label="t(labelKey)">{{ value }}</StatCard>
      </StatGrid>
      <InfoCard :title="t('modelInfo')">
        <InfoRow :label="t('modelNameOrId')">{{ model.name }}</InfoRow>
        <InfoRow :label="t('slug')">{{ model.slug }}</InfoRow>
        <InfoRow v-if="model.model_creators?.name" :label="t('creator')">
          {{ model.model_creators.name }}
        </InfoRow>
        <InfoRow v-if="model.release_date" :label="t('releaseDate')">{{ model.release_date }}</InfoRow>
      </InfoCard>
      <PageSection :title="t('modelDetail')">
        <ModelDetailContent :model="model" />
      </PageSection>
    </div>
  </DetailShell>
</template>
