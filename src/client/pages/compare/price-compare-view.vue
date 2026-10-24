<script setup lang="ts">
import { computed, h, type VNodeChild } from "vue";
import { useTranslation } from "@/client/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatDollar } from "@/shared/utils";
import CompareTable, { WinnerValue } from "./compare-table.vue";
import CostEstimator from "./estimator.vue";
import { rankingTabHref } from "@/client/nav/sources";
import ComparePageLayout from "./compare-layout.vue";
import { buildPriceRows, type CompareRow, type Winner } from "@/client/utils/compare-logic";

const { t } = useTranslation();

const priceRows = computed(() => buildPriceRows(t));

/** Back to the AA rankings tab with its pricing mode open — the list this page breaks down. */
const backTo = rankingTabHref("modelRankings", "pricing");

function renderPrice(
  row: CompareRow<ArtificialAnalysisModel>,
  model: ArtificialAnalysisModel,
  winner: Winner | null,
): VNodeChild {
  const value = row.getNumeric(model);
  return typeof value === "number"
    ? h(WinnerValue, { value: formatDollar(value, t), winner })
    : h("span", { class: "text-text-tertiary" }, t("notAvailable"));
}
</script>

<template>
  <ComparePageLayout :back-to="backTo" :title="t('priceComparison')">
    <template #default="{ models }">
      <p class="ui-meta lg:col-span-2">{{ t("priceUnitNote") }}</p>
      <div class="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <CompareTable :title="t('priceBreakdown')" :rows="priceRows" :models="models" :render-value="renderPrice" />
        <CostEstimator :models="models" />
      </div>
    </template>
  </ComparePageLayout>
</template>
