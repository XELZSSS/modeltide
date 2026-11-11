<script setup lang="ts">
/** One contestant's facts, printed identically by the addressable detail page and by the decision ranking's expanded row
 * — the place the open-source ranking already keeps the same thing (`OsModelFacts`). The evaluation scores are 0-100
 * numbers, printed as percentages. */
import { useTranslation } from "@/client/i18n";
import { formatDollar, formatDurationMs, formatPercent, formatScore, orNA } from "@/shared/utils";
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
      <InfoCard :title="t('evalAccuracy')">
        <InfoRow :label="t('omniscienceAccuracy')">
          {{ formatPercent(props.entry.scores.omniscienceAccuracy, t) }}
        </InfoRow>
        <InfoRow :label="t('nonHallucinationRate')">
          {{ formatPercent(props.entry.scores.omniscienceNonHallucinationRate, t) }}
        </InfoRow>
        <InfoRow :label="t('hleAccuracy')">{{ formatPercent(props.entry.scores.hleAccuracy, t) }}</InfoRow>
        <InfoRow :label="t('hleNonHallucination')">
          {{ formatPercent(props.entry.scores.hleNonHallucinationRate, t) }}
        </InfoRow>
        <InfoRow :label="t('when2call')">{{ formatPercent(props.entry.scores.when2callAccuracy, t) }}</InfoRow>
        <InfoRow :label="t('evalsafeOnet')">{{ formatPercent(props.entry.scores.evalsafeOnetAccuracy, t) }}</InfoRow>
        <InfoRow :label="t('documentDecision')">
          {{ formatPercent(props.entry.scores.documentDecisionAllPassRate, t) }}
        </InfoRow>
        <InfoRow :label="t('invariance')">{{ formatPercent(props.entry.scores.invarianceAllPassRate, t) }}</InfoRow>
        <InfoRow :label="t('invarianceSymmetry')">
          {{ formatPercent(props.entry.scores.invarianceSymmetry, t) }}
        </InfoRow>
      </InfoCard>
      <InfoCard :title="t('decisionScores')">
        <InfoRow :label="t('omniscience')">
          {{ formatPercent(props.entry.scores.omniscienceDecisionScore, t) }}
        </InfoRow>
        <InfoRow :label="t('hle')">{{ formatPercent(props.entry.scores.hleDecisionScore, t) }}</InfoRow>
        <InfoRow :label="t('when2call')">
          {{ formatPercent(props.entry.scores.when2callDecisionScore, t) }}
        </InfoRow>
        <InfoRow :label="t('evalsafeOnet')">
          {{ formatPercent(props.entry.scores.evalsafeOnetDecisionScore, t) }}
        </InfoRow>
        <InfoRow :label="t('documentDecision')">
          {{ formatPercent(props.entry.scores.documentDecisionDecisionScore, t) }}
        </InfoRow>
      </InfoCard>
    </InfoGrid>
  </div>
</template>
