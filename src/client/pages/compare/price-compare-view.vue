<script setup lang="ts">
import { computed, h, type VNodeChild } from "vue";
import { useTranslation } from "@/client/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatDollar } from "@/shared/utils";
import CompareTable, { WinnerValue } from "./compare-table.vue";
import CostEstimator from "./estimator.vue";
import { SOURCES } from "@/client/nav/sources";
import ComparePageLayout from "./compare-layout.vue";
import { buildPriceRows, type CompareRow, type Winner } from "@/client/utils/compare-logic";

const { t } = useTranslation();

const priceRows = computed(() => buildPriceRows(t));

function renderPrice(
  row: CompareRow<ArtificialAnalysisModel>,
  model: ArtificialAnalysisModel,
  winner: Winner | null,
): VNodeChild {
  const value = row.getNumeric?.(model);
  return typeof value === "number"
    ? h(WinnerValue, { value: formatDollar(value, t), winner })
    : h("span", { class: "text-text-tertiary" }, t("notAvailable"));
}
</script>

<template>
  <ComparePageLayout :back-to="`${SOURCES.aa.backTo}&view=pricing`" :title="t('priceComparison')">
    <template #default="{ models }">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch min-w-0">
        <CompareTable :title="t('priceBreakdown')" :rows="priceRows" :models="models" :render-value="renderPrice" />
        <CostEstimator :models="models" />
      </div>
    </template>
  </ComparePageLayout>
</template>
