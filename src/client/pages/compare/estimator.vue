<script setup lang="ts">
import { computed } from "vue";
import { approxEq } from "@/shared/utils";
import { modelDisplayName, modelId } from "@/shared/utils/models";
import { formatDollar } from "@/shared/utils";
import { cn } from "@/client/utils/cn";
import type { ArtificialAnalysisModel } from "@/shared/types";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import CardHeader from "@/client/components/layout/card-header.vue";
import { useTranslation } from "@/client/i18n";
import { seriesColor, useChartTheme } from "@/client/charts/theme";
import { useCostEstimates } from "./cost-inputs";
import CostEstimatorInputs from "./cost-form.vue";
import { WinnerMark } from "./winner-marks.ts";
import { modelKeyOf } from "@/client/utils/compare-logic";

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const theme = useChartTheme();

const costState = useCostEstimates(() => props.models);
const costEstimates = costState.costEstimates;

function monthlyOf(model: ArtificialAnalysisModel): number | null {
  return costEstimates.value.get(modelId(model))?.monthlyCost ?? null;
}

/** Best and average of the same monthly figures the rows print: no second derivation, and no intermediate array. */
const costSummary = computed(() => {
  let best: number | null = null;
  let total = 0;
  let count = 0;
  for (const estimate of costEstimates.value.values()) {
    const monthly = estimate.monthlyCost;
    if (monthly == null) continue;
    if (best == null || monthly < best) best = monthly;
    total += monthly;
    count += 1;
  }
  return { best, avg: count === 0 ? null : total / count };
});

const bestMonthlyCost = computed(() => costSummary.value.best);

const avgMonthlyCost = computed(() => costSummary.value.avg);

function isBestCost(model: ArtificialAnalysisModel): boolean {
  const cost = monthlyOf(model);
  return cost != null && bestMonthlyCost.value != null && approxEq(cost, bestMonthlyCost.value);
}
</script>

<template>
  <Card>
    <CardContent compact>
      <CardHeader :title="t('estimatedMonthlyCost')" />
      <div class="flex flex-col gap-3">
        <div class="flex flex-col flex-wrap gap-2 sm:flex-row">
          <CostEstimatorInputs :state="costState" :avg-cost="avgMonthlyCost" />
        </div>
        <div class="flex flex-col gap-1.5">
          <div
            v-for="(model, index) in props.models"
            :key="modelKeyOf(model, index)"
            class="flex items-center justify-between gap-2"
          >
            <span
              class="min-w-0 ui-body break-words md:truncate"
              :style="{ color: seriesColor(theme, index) }"
              v-tooltip="modelDisplayName(model)"
            >
              {{ modelDisplayName(model) }}
            </span>
            <span
              v-if="monthlyOf(model) != null"
              :class="cn('ui-mono-value', isBestCost(model) && 'font-semibold text-success')"
            >
              {{ formatDollar(monthlyOf(model), t) }}
              <WinnerMark v-if="isBestCost(model)" />
            </span>
            <span v-else class="ui-mono-value text-text-tertiary">{{ t("notAvailable") }}</span>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
