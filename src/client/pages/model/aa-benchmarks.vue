<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { benchmarkLabel, formatPercent, formatScore } from "@/shared/utils";
import { benchmarkScaleOf } from "@/shared/config";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";

/**
 * The benchmark grid of one model.
 *
 * `benchmarks` holds two scales — percentages (0-100, converted from the upstream ratio) and absolute scores (Elo, the
 * signed omniscience index) — so each value is formatted with the unit its own scale implies. Without that branch the
 * grid presents 83 and 1245 as the same kind of number.
 */
const props = defineProps<{ model: ArtificialAnalysisModel }>();

const { t } = useTranslation();

const showBenchmarksSection = computed(
  () => props.model.benchmarks != null && Object.values(props.model.benchmarks).some((v) => v != null),
);

const benchmarkStats = computed(() => {
  const benchmarks = props.model.benchmarks;
  if (!benchmarks) return [];
  return Object.entries(benchmarks)
    .map(([key, value]) => ({ key, display: value }))
    .filter((entry) => entry.display != null);
});

function formatBenchmark(key: string, value: number | null | undefined): string {
  return benchmarkScaleOf(key) === "percent" ? formatPercent(value, t) : formatScore(value, t);
}
</script>

<template>
  <PageSection v-if="showBenchmarksSection" :title="t('benchmarks')">
    <StatGrid :columns="4">
      <StatCard v-for="entry in benchmarkStats" :key="entry.key" :label="benchmarkLabel(entry.key, t)">
        {{ formatBenchmark(entry.key, entry.display) }}
      </StatCard>
    </StatGrid>
  </PageSection>
</template>
