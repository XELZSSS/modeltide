<script setup lang="ts">
import { computed } from "vue";
import { navigate } from "@/client/router";
import { useTranslation } from "@/client/i18n";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { useCompareModels, useCompareStore, usePruneCompareIds } from "@/client/stores";
import { useEffectivePricingMap, useMonthlyCosts } from "@/client/pricing/cost-inputs";
import CostEstimatorInputs from "@/client/pricing/cost-form.vue";
import CompareChipBar from "@/client/features/compare/compare-tray.vue";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import SegmentedGroup from "@/client/components/ui/segmented-group.vue";
import TabButton from "@/client/components/ui/tab-button.vue";
import SearchableDataTable from "@/client/components/data/table/data-table.vue";
import ModelExpandedDetail from "./aa/aa-cells.vue";
import { buildRankingColumns } from "./aa/aa-rank-columns";
import { buildPricingColumns, type PricingRow } from "./aa/aa-price-columns";
import { modelId } from "@/client/utils/model-utils";
import { EMPTY_MODELS } from "@/client/utils/empty";
import type { ArtificialAnalysisModel } from "@/shared/types";

const VIEW_MODES = ["rankings", "pricing"] as const;

const props = defineProps<{ rankings: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();
const store = useCompareStore();
const [viewMode, setViewMode] = useClientTab("view", VIEW_MODES, VIEW_MODES[0]);

const pricingMode = computed(() => viewMode.value === "pricing");
const pricingModels = computed(() => (pricingMode.value ? props.rankings : EMPTY_MODELS));

const effectivePricingMap = useEffectivePricingMap(pricingModels);
const costState = useMonthlyCosts(pricingModels);
const monthlyCosts = costState.monthlyCosts;
const comparedModels = useCompareModels(() => props.rankings);

usePruneCompareIds(() => props.rankings);

const viewItems = computed(() => [
  { id: "rankings" as const, label: t("modelRankings") },
  { id: "pricing" as const, label: t("pricing") },
]);

const avgCost = computed(() => {
  const valid = [...monthlyCosts.value.values()].filter((v): v is number => v != null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
});

const rankingColumns = computed(() => buildRankingColumns(t));
const pricingColumns = computed(() => buildPricingColumns(t, effectivePricingMap.value));

const pricingRows = computed<PricingRow[]>(() =>
  props.rankings.map((model) => ({ model, monthlyCost: monthlyCosts.value.get(modelId(model)) ?? null })),
);

function handleCompare(): void {
  navigate(pricingMode.value ? "/price-compare" : "/compare");
}

const getAARowId = (model: ArtificialAnalysisModel) => modelId(model);
const getAARowName = (model: ArtificialAnalysisModel) => model.name || model.slug || modelId(model);
const getPricingRowId = (row: PricingRow) => modelId(row.model);
const getPricingRowName = (row: PricingRow) => row.model.name || row.model.slug || modelId(row.model);
const getPricingSearchFields = (row: PricingRow) => SEARCH_FIELDS.aa(row.model);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2 min-w-0">
      <SegmentedGroup class="overflow-x-auto no-scrollbar" role="radiogroup" :aria-label="t('viewMode')">
        <TabButton
          v-for="item in viewItems"
          :key="item.id"
          role="radio"
          :active="viewMode === item.id"
          @click="setViewMode(item.id)"
        >
          {{ item.label }}
        </TabButton>
      </SegmentedGroup>
    </div>

    <div v-if="pricingMode" class="flex gap-4 flex-wrap items-center">
      <CostEstimatorInputs :state="costState" layout="input-label" :avg-cost="avgCost" />
    </div>

    <CompareChipBar
      :models="comparedModels"
      @remove="store.removeCompareModel"
      @clear="store.clearCompare"
      @compare="handleCompare"
    >
      <template #leading>
        <p v-if="pricingMode" class="text-xs text-text-tertiary">{{ t("pricingDisclaimer") }}</p>
      </template>
    </CompareChipBar>
    <SearchableDataTable
      v-if="pricingMode"
      :data="pricingRows"
      :columns="pricingColumns"
      :get-row-id="getPricingRowId"
      :get-row-name="getPricingRowName"
      :get-search-fields="getPricingSearchFields"
    >
      <template #expandedRow="{ row }">
        <ModelExpandedDetail :model="row.model" />
      </template>
    </SearchableDataTable>
    <SearchableDataTable
      v-else
      :data="rankings"
      :columns="rankingColumns"
      :get-row-id="getAARowId"
      :get-row-name="getAARowName"
      :get-search-fields="SEARCH_FIELDS.aa"
    >
      <template #expandedRow="{ row }">
        <ModelExpandedDetail :model="row" />
      </template>
    </SearchableDataTable>
  </div>
</template>
