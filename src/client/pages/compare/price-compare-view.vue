<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { formatDollar } from "@/shared/utils";
import CompareTable from "./compare-table.vue";
import CostEstimator from "./estimator.vue";
import { rankingTabHref } from "@/client/nav/sources";
import ComparePageLayout from "./compare-layout.vue";
import { buildPriceRows } from "@/client/utils/compare-logic";
import { makeWinnerRenderer } from "./winner-renderer";

const { t } = useTranslation();

const priceRows = computed(() => buildPriceRows(t));

/** Back to the AA rankings tab with its pricing mode open — the list this page breaks down. */
const backTo = rankingTabHref("modelRankings", "pricing");

const renderPrice = makeWinnerRenderer(t, (value) => formatDollar(value, t));
</script>

<template>
  <ComparePageLayout :back-to="backTo" :title="t('priceComparison')">
    <template #default="{ models }">
      <p class="ui-meta">{{ t("priceUnitNote") }}</p>
      <div class="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <CompareTable :title="t('priceBreakdown')" :rows="priceRows" :models="models" :render-value="renderPrice" />
        <CostEstimator :models="models" />
      </div>
    </template>
  </ComparePageLayout>
</template>
