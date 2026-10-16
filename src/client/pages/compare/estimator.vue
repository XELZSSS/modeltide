<script setup lang="ts">
import { computed } from "vue";
import { approxEq } from "@/shared/utils";
import { modelDisplayName, modelId } from "@/shared/utils/models";
import { formatDollar } from "@/shared/utils";
import { cn } from "@/client/utils/cn";
import type { ArtificialAnalysisModel } from "@/shared/types";
import Card from "@/client/components/card.vue";
import CardContent from "@/client/components/card-content.vue";
import CardHeader from "@/client/components/card-header.vue";
import { useTranslation } from "@/client/i18n";
import { seriesColor, useChartTheme } from "@/client/charts/theme";
import { useMonthlyCosts } from "./cost-inputs";
import CostEstimatorInputs from "./cost-form.vue";
import { WinnerMark } from "./compare-table.vue";
import { modelKeyOf } from "@/client/utils/compare-logic";

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const theme = useChartTheme();

const costState = useMonthlyCosts(() => props.models);
const monthlyCosts = costState.monthlyCosts;

const costSummary = computed(() => {
  const valid = [...monthlyCosts.value.values()].filter((v): v is number => v !== null);
  if (valid.length === 0) return { best: null as number | null, avg: null as number | null };
  return { best: Math.min(...valid), avg: valid.reduce((a, b) => a + b, 0) / valid.length };
});

const bestMonthlyCost = computed(() => costSummary.value.best);

const avgMonthlyCost = computed(() => costSummary.value.avg);

function costOf(model: ArtificialAnalysisModel): number | null {
  return monthlyCosts.value.get(modelId(model)) ?? null;
}

function isBestCost(model: ArtificialAnalysisModel): boolean {
  const cost = costOf(model);
  return cost != null && bestMonthlyCost.value != null && approxEq(cost, bestMonthlyCost.value);
}
</script>

<template>
  <Card>
    <CardContent class="!p-0">
      <div class="px-4 pt-4"><CardHeader :title="t('estimatedMonthlyCost')" class="mb-3" /></div>
      <div class="px-4 pb-4 flex flex-col gap-3">
        <div class="flex flex-col sm:flex-row flex-wrap gap-2">
          <CostEstimatorInputs :state="costState" :avg-cost="avgMonthlyCost" />
        </div>
        <div class="flex flex-col gap-1.5">
          <div
            v-for="(model, index) in props.models"
            :key="modelKeyOf(model, index)"
            class="flex items-center justify-between gap-2"
          >
            <span
              class="text-sm truncate"
              :style="{ color: seriesColor(theme, index) }"
              :title="modelDisplayName(model)"
            >
              {{ modelDisplayName(model) }}
            </span>
            <span
              v-if="costOf(model) != null"
              :class="cn('font-mono text-sm', isBestCost(model) && 'font-semibold text-success')"
            >
              {{ formatDollar(costOf(model), t) }}
              <WinnerMark v-if="isBestCost(model)" />
            </span>
            <span v-else class="text-sm text-text-tertiary">{{ t("notAvailable") }}</span>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
