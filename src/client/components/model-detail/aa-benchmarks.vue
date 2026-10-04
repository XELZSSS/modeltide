<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { ABSOLUTE_SCORE_BENCHMARKS, type BenchmarkKey } from "@/shared/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { benchmarkLabel, formatScore } from "@/client/utils/format";
import { unclampedPercent } from "@/shared/utils";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import StatCard from "@/client/components/ui/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";

const props = defineProps<{ model: ArtificialAnalysisModel }>();

const { t } = useTranslation();

const showBenchmarksSection = computed(
  () =>
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
</script>

<template>
  <PageSection v-if="showBenchmarksSection" :title="t('benchmarks')">
    <StatGrid :columns="4">
      <StatCard v-for="entry in benchmarkStats" :key="entry.key" :label="benchmarkLabel(entry.key, t)">
        {{ formatScore(entry.display, t) }}
      </StatCard>
    </StatGrid>
  </PageSection>
</template>
