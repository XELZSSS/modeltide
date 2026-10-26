<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { BenchmarkKey } from "@/shared/config";
import { formatRatio, formatScore } from "@/shared/utils";
import { useSuspenseArtificialRankingsState } from "@/client/api/view-models";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";
import ModelMiss from "@/client/components/feedback/model-miss.vue";
import ModelDetailContent from "./aa-detail.vue";
import DetailShell, { findModel } from "./detail-views.vue";
import { useModelLookup } from "./use-model-lookup";

const props = defineProps<{ decodedId: string }>();

const { t } = useTranslation();

// The AA index is the only payload this page reads, so it answers two different questions: whether the model exists,
// and whether the omniscience evaluation has scored it yet. Looking the model up in the *derived* ranking list instead
// answered both with one lookup, which reported every model the evaluation has not reached as "not found".
const aaState = await useSuspenseArtificialRankingsState();
const { model, partial } = useModelLookup(
  () => findModel(aaState.value.items, props.decodedId, "id", "slug"),
  () => aaState.value.partial,
);

/**
 * The signed index first, then the three components that explain it — the order the evaluation itself reads in.
 * `omniscience` is the field it always writes, so it decides whether this model has a score at all; the other three are
 * optional and print as N/A when absent. Every value is the upstream number as sent: the index through `formatScore`
 * (the formatter the hallucination *ranking* column uses, so the same number reads the same on both surfaces), the
 * three 0-1 ratios through `formatRatio`.
 */
const hallStats = computed<{ key: TranslationKey; value: string }[]>(() => {
  const total = model.value?.omniscience_breakdown?.total;
  const score = total?.omniscience;
  if (!total || score == null) return [];
  return [
    { key: "omniscienceIndex", value: formatScore(score, t) },
    { key: "accuracy", value: formatRatio(total.accuracy, t) },
    { key: "hallucinationRate", value: formatRatio(total.hallucination_rate, t) },
    { key: "attemptRate", value: formatRatio(total.attempt_rate, t) },
  ];
});

/**
 * Those cards already print the omniscience index, so the shared model detail below leaves it out of its benchmark
 * grid: one number, one place. Every other benchmark still renders.
 */
const OMIT_BENCHMARKS = ["omniscience"] as const satisfies readonly BenchmarkKey[];
</script>

<template>
  <ModelMiss v-if="!model" :partial="partial" />
  <DetailShell v-else source="hall" :title="model.name">
    <div :class="DETAIL_BLOCK_GAP">
      <PartialNotice v-if="partial" />
      <PageSection :title="t('omniscienceEvaluation')">
        <EmptyState v-if="hallStats.length === 0" variant="plain" compact :message="t('hallucinationNotScored')" />
        <StatGrid v-else :columns="4">
          <StatCard v-for="stat in hallStats" :key="stat.key" :label="t(stat.key)">
            {{ stat.value }}
          </StatCard>
        </StatGrid>
      </PageSection>
      <ModelDetailContent :model="model" :omit-benchmarks="OMIT_BENCHMARKS" />
    </div>
  </DetailShell>
</template>
