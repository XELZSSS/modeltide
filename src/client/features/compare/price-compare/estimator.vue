<script setup lang="ts">
import { computed } from "vue";
import { approxEq } from "@/shared/utils";
import { modelDisplayName, modelId } from "@/shared/utils/models";
import { formatDollar } from "@/client/utils/format";
import { cn } from "@/client/utils/cn";
import type { ArtificialAnalysisModel } from "@/shared/types";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import { useTranslation } from "@/client/i18n";
import { seriesColor, useChartTheme } from "@/client/theme/chart-theme";
import { useMonthlyCosts } from "@/client/pricing/cost-inputs";
import CostEstimatorInputs from "@/client/pricing/cost-form.vue";
import { WinnerMark } from "@/client/features/compare/compare-table.vue";
import { modelKeyOf } from "@/client/utils/compare-logic";

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const theme = useChartTheme();

const costState = useMonthlyCosts(() => props.models);
const monthlyCosts = costState.monthlyCosts;

const bestMonthlyCost = computed(() => {
  const valid = [...monthlyCosts.value.values()].filter((v): v is number => v !== null);
  return valid.length > 0 ? Math.min(...valid) : null;
});

const avgMonthlyCost = computed(() => {
  const valid = [...monthlyCosts.value.values()].filter((v): v is number => v !== null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
});

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
    <CardContent>
      <CardHeader :title="t('estimatedMonthlyCost')" />
      <div class="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mb-5">
        <CostEstimatorInputs :state="costState" :avg-cost="avgMonthlyCost" />
      </div>
      <div class="flex flex-col gap-3">
        <div
          v-for="(model, index) in props.models"
          :key="modelKeyOf(model, index)"
          class="flex items-center justify-between gap-2"
        >
          <span class="text-sm truncate" :style="{ color: seriesColor(theme, index) }">
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
    </CardContent>
  </Card>
</template>
