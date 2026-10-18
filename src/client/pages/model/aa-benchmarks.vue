<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { benchmarkLabel, formatScore } from "@/shared/utils";
import StatGrid from "@/client/components/stat-grid.vue";
import StatCard from "@/client/components/stat-card.vue";
import PageSection from "@/client/components/page-section.vue";

const props = defineProps<{ model: ArtificialAnalysisModel }>();

const { t } = useTranslation();

const showBenchmarksSection = computed(
  () => props.model.benchmarks != null && Object.values(props.model.benchmarks).some((v) => v != null),
);

const benchmarkStats = computed(() => {
  const benchmarks = props.model.benchmarks;
  if (!benchmarks) return [];
  // Server sends final values (percent for relative, raw for absolute): no client rescaling.
  return Object.entries(benchmarks)
    .map(([key, value]) => ({ key, display: value }))
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
