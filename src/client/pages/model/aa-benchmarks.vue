<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { benchmarkLabel, formatRatio, formatScore } from "@/shared/utils";
import {
  BENCHMARK_GROUPS,
  BENCHMARK_GROUP_OF,
  BENCHMARK_KEYS,
  benchmarkNoticeOf,
  benchmarkScaleOf,
  type BenchmarkKey,
  type BenchmarkNotice,
} from "@/shared/config";
import { todayIso } from "@/shared/config/time";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import Badge from "@/client/components/ui/badge.vue";

/** The benchmark grid of one model: one block per kind of evaluation, and inside a block the two scales (0-1 ratios and
 * indices) never share a grid. Every value is the upstream number as sent, with no unit appended — the labels already
 * name the metric — and nothing is rescaled. Columns follow `BENCHMARK_KEYS`, and a grid with nothing to show is dropped. */
const props = withDefaults(defineProps<{ model: ArtificialAnalysisModel; omit?: readonly BenchmarkKey[] }>(), {
  omit: () => [],
});

const { t } = useTranslation();

interface BenchmarkCell {
  key: BenchmarkKey;
  value: number;
  /** The evaluation's badge, when one is still in force. */
  notice?: { label: string; hint: string; className: string };
}

const NOTICE_TEXT: Record<BenchmarkNotice["kind"], { label: TranslationKey; hint: TranslationKey; className: string }> =
  {
    new: { label: "benchmarkNew", hint: "benchmarkNewHint", className: "text-success" },
    underReview: { label: "benchmarkUnderReview", hint: "benchmarkUnderReviewHint", className: "text-warning" },
  };

const today = todayIso();

function cellOf(key: BenchmarkKey, value: number): BenchmarkCell {
  const notice = benchmarkNoticeOf(key, today);
  if (notice === undefined) return { key, value };
  const text = NOTICE_TEXT[notice.kind];
  return { key, value, notice: { label: t(text.label), hint: t(text.hint), className: text.className } };
}

const groups = computed(() =>
  BENCHMARK_GROUPS.map((group) => {
    const ratio: BenchmarkCell[] = [];
    const index: BenchmarkCell[] = [];
    for (const key of BENCHMARK_KEYS) {
      if (BENCHMARK_GROUP_OF[key] !== group.id || props.omit.includes(key)) continue;
      const value = props.model.benchmarks[key];
      if (value == null) continue;
      (benchmarkScaleOf(key) === "ratio" ? ratio : index).push(cellOf(key, value));
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
            <template v-if="cell.notice" #badge>
              <Badge v-tooltip="cell.notice.hint" :class="cell.notice.className">{{ cell.notice.label }}</Badge>
            </template>
            {{ formatBenchmark(cell) }}
          </StatCard>
        </StatGrid>
        <StatGrid v-if="group.index.length > 0" :columns="4">
          <StatCard v-for="cell in group.index" :key="cell.key" :label="benchmarkLabel(cell.key, t)">
            <template v-if="cell.notice" #badge>
              <Badge v-tooltip="cell.notice.hint" :class="cell.notice.className">{{ cell.notice.label }}</Badge>
            </template>
            {{ formatBenchmark(cell) }}
          </StatCard>
        </StatGrid>
      </div>
    </PageSection>
  </div>
</template>
