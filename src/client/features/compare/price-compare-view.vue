<script setup lang="ts">
import { computed, h, type VNodeChild } from "vue";
import { useTranslation } from "@/client/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatDollar } from "@/client/utils/format";
import CompareTable, { WinnerValue } from "@/client/features/compare/compare-table.vue";
import CostEstimator from "@/client/features/compare/price-compare/estimator.vue";
import { MODEL_SOURCES } from "@/client/config/nav-config";
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
  <ComparePageLayout :back-to="`${MODEL_SOURCES.aa.backTo}&view=pricing`" :title="t('priceComparison')">
    <template #default="{ models }">
      <div class="flex flex-col gap-3">
        <p class="text-sm font-semibold">{{ t("priceBreakdown") }}</p>
        <CompareTable :rows="priceRows" :models="models" :render-value="renderPrice" />
      </div>
      <CostEstimator :models="models" />
    </template>
  </ComparePageLayout>
</template>
