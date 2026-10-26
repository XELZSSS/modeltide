<script setup lang="ts">
/**
 * One contestant's facts, printed identically by the addressable detail page and by the decision ranking's expanded
 * row — the place the open-source ranking already keeps the same thing (`OsModelFacts`). The two hero numbers are the
 * pair the evaluation is read for; the run's latency sits with the rest of the run's facts. The five evaluation scores
 * are printed as the upstream sends them (`formatRatio`): the payload's scale is its own, so no site-side conversion.
 */
import { useTranslation } from "@/client/i18n";
import { formatDollar, formatDurationMs, formatRatio, formatScore, orNA } from "@/shared/utils";
import type { DecisionIndexEntry } from "@/shared/types";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import InfoGrid from "@/client/components/layout/info-grid.vue";
import InfoCard from "@/client/components/layout/info-card.vue";
import InfoRow from "@/client/components/layout/info-row.vue";

const props = defineProps<{ entry: DecisionIndexEntry }>();

const { t } = useTranslation();
</script>

<template>
  <div :class="DETAIL_BLOCK_GAP">
    <StatGrid :columns="2">
      <StatCard :label="t('decisionIndex')">{{ formatScore(props.entry.index, t) }}</StatCard>
      <StatCard :label="t('costPerTask')">{{ formatDollar(props.entry.costPerTaskUsd, t) }}</StatCard>
    </StatGrid>
    <InfoGrid>
      <InfoCard :title="t('modelInfo')">
        <InfoRow :label="t('creator')">{{ orNA(props.entry.creator, t) }}</InfoRow>
        <InfoRow :label="t('kind')">
          {{ t(props.entry.kind === "decisionModel" ? "kindDecisionModel" : "kindLlm") }}
        </InfoRow>
        <InfoRow :label="t('contestantId')">{{ props.entry.id }}</InfoRow>
        <InfoRow :label="t('timePerTask')">{{ formatDurationMs(props.entry.timePerTaskMs, t) }}</InfoRow>
      </InfoCard>
      <InfoCard :title="t('benchmarks')">
        <InfoRow :label="t('omniscienceAccuracy')">
          {{ formatRatio(props.entry.scores.omniscienceAccuracy, t) }}
        </InfoRow>
        <InfoRow :label="t('nonHallucinationRate')">
          {{ formatRatio(props.entry.scores.omniscienceNonHallucinationRate, t) }}
        </InfoRow>
        <InfoRow :label="t('hleTextMcq')">{{ formatRatio(props.entry.scores.hleTextMcqAccuracy, t) }}</InfoRow>
        <InfoRow :label="t('when2call')">{{ formatRatio(props.entry.scores.when2callAccuracy, t) }}</InfoRow>
        <InfoRow :label="t('wildguardF1')">{{ formatRatio(props.entry.scores.wildguardtestAverageF1, t) }}</InfoRow>
      </InfoCard>
    </InfoGrid>
  </div>
</template>
