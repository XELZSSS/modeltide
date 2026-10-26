<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { benchmarkLabel, formatRatio, formatScore } from "@/shared/utils";
import {
  BENCHMARK_GROUPS,
  BENCHMARK_GROUP_OF,
  BENCHMARK_KEYS,
  benchmarkScaleOf,
  type BenchmarkKey,
} from "@/shared/config";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";

/**
 * The benchmark grid of one model: one block per kind of evaluation, and inside a block the two scales never share a
 * grid. Every value is the upstream number as sent — a 0-1 ratio stays `0.92`, an index keeps 1586.76 or -5.3 — and the
 * two are separated because one grid holding both presented them as the same kind of number.
 *
 * No unit is appended to a value: the labels already name the metric (`Briefcase Elo`, `全能指数`, `GDPVal Elo`) and a
 * second "index" after the number only repeated the label. The split into two grids is what carries the distinction.
 *
 * Nothing here rescales a value. The only arithmetic is the comparison chart's, which normalises where it plots because
 * a single axis cannot carry both 0.83 and 1500.
 *
 * Columns follow `BENCHMARK_KEYS` inside each grid, so a value keeps its place between one model and the next, and a
 * grid with nothing to show is dropped rather than rendered empty.
 */
const props = withDefaults(defineProps<{ model: ArtificialAnalysisModel; omit?: readonly BenchmarkKey[] }>(), {
  omit: () => [],
});

const { t } = useTranslation();

interface BenchmarkCell {
  key: BenchmarkKey;
  value: number;
}

const groups = computed(() =>
  BENCHMARK_GROUPS.map((group) => {
    const ratio: BenchmarkCell[] = [];
    const index: BenchmarkCell[] = [];
    for (const key of BENCHMARK_KEYS) {
      if (BENCHMARK_GROUP_OF[key] !== group.id || props.omit.includes(key)) continue;
      const value = props.model.benchmarks[key];
      if (value == null) continue;
      (benchmarkScaleOf(key) === "ratio" ? ratio : index).push({ key, value });
    }
    return { id: group.id, title: t(group.labelKey), ratio, index };
  }).filter((group) => group.ratio.length > 0 || group.index.length > 0),
);

function formatBenchmark(cell: BenchmarkCell): string {
  return benchmarkScaleOf(cell.key) === "ratio" ? formatRatio(cell.value, t) : formatScore(cell.value, t);
}
</script>

<template>
  <div v-if="groups.length > 0" :class="DETAIL_BLOCK_GAP">
    <PageSection v-for="group in groups" :key="group.id" :title="group.title">
      <div :class="DETAIL_BLOCK_GAP">
        <StatGrid v-if="group.ratio.length > 0" :columns="4">
          <StatCard v-for="cell in group.ratio" :key="cell.key" :label="benchmarkLabel(cell.key, t)">
            {{ formatBenchmark(cell) }}
          </StatCard>
        </StatGrid>
        <StatGrid v-if="group.index.length > 0" :columns="4">
          <StatCard v-for="cell in group.index" :key="cell.key" :label="benchmarkLabel(cell.key, t)">
            {{ formatBenchmark(cell) }}
          </StatCard>
        </StatGrid>
      </div>
    </PageSection>
  </div>
</template>
