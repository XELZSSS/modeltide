<script setup lang="ts">
import { computed } from "vue";
import { navigate } from "@/client/router";
import { useTranslation } from "@/client/i18n";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { VIEW_PARAM } from "@/client/nav/nav-config";
import { PATHS } from "@/client/router/paths";
import { useCompareStore, useCostStore } from "@/client/stores";
import { useCompareModels, usePruneCompareIds } from "@/client/hooks/use-compare-models";
import { usePricingMaps } from "@/client/hooks/use-pricing-maps";
import CompareChipBar from "@/client/components/navigation/compare-chip-bar.vue";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import SegmentedGroup from "@/client/components/ui/segmented-group.vue";
import TabButton from "@/client/components/navigation/tab-button.vue";
import { useRovingRadio } from "@/client/components/navigation/tabs";
import SearchableDataTable from "@/client/components/table/data-table.vue";
import ModelExpandedDetail from "./aa/aa-cells.vue";
import { buildRankingColumns } from "./aa/aa-rank-columns";
import { buildPricingColumns, type PricingRow } from "./aa/aa-price-columns";
import { useRankExtras } from "@/client/hooks/use-rank-extras";
import { modelId } from "@/shared/utils/models";
import type { ArtificialAnalysisModel } from "@/shared/types";

const EMPTY_MODELS: ArtificialAnalysisModel[] = [];
Object.freeze(EMPTY_MODELS);

const VIEW_MODES = ["rankings", "pricing"] as const;

const props = defineProps<{ rankings: ArtificialAnalysisModel[]; partial?: boolean }>();

const { t } = useTranslation();
const store = useCompareStore();
const costStore = useCostStore();
const [viewMode, setViewMode] = useClientTab(VIEW_PARAM, VIEW_MODES, VIEW_MODES[0]);
const { tabIndexFor: viewTabIndex, onKeydown: onViewKeydown } = useRovingRadio({
  items: () => VIEW_MODES,
  activeId: () => viewMode.value,
  elementId: (id) => `view-mode-${id}`,
  select: (id) => setViewMode(id),
});

const pricingMode = computed(() => viewMode.value === "pricing");
const pricingModels = computed(() => (pricingMode.value ? props.rankings : EMPTY_MODELS));

const pricing = usePricingMaps(pricingModels, () => costStore.values);
const effectivePricingMap = pricing.effectivePricing;
const costEstimates = pricing.costEstimates;
const comparedModels = useCompareModels(() => props.rankings);

usePruneCompareIds(
  () => props.rankings,
  undefined,
  () => props.partial === true,
);

const viewItems = computed(() => [
  { id: "rankings" as const, label: t("modelRankings") },
  { id: "pricing" as const, label: t("pricing") },
]);

// The tab's default order is the ranking, so a row's position in it is its rank; the name links to the AA detail page —
// the same one the model search and the expanded row lead to.
const rowExtras = useRankExtras(() => props.rankings, modelId, "aa");

const rankingColumns = computed(() => buildRankingColumns(t, rowExtras.value));
const pricingColumns = computed(() => buildPricingColumns(t, effectivePricingMap.value, rowExtras.value));

const pricingRows = computed<PricingRow[]>(() =>
  props.rankings.map((model) => ({ model, estimate: costEstimates.value.get(modelId(model)) ?? null })),
);

function handleCompare(): void {
  navigate(pricingMode.value ? PATHS.priceCompare : PATHS.compare);
}

const modelRowName = (m: ArtificialAnalysisModel) => m.name || m.slug || modelId(m);
const getAARowId = (model: ArtificialAnalysisModel) => modelId(model);
const getAARowName = (model: ArtificialAnalysisModel) => modelRowName(model);
const getPricingRowId = (row: PricingRow) => modelId(row.model);
const getPricingRowName = (row: PricingRow) => modelRowName(row.model);
const getPricingSearchFields = (row: PricingRow) => SEARCH_FIELDS.aa(row.model);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <SegmentedGroup class="flex-wrap" role="radiogroup" :aria-label="t('viewMode')" @keydown="onViewKeydown">
        <TabButton
          v-for="item in viewItems"
          :key="item.id"
          role="radio"
          :id="`view-mode-${item.id}`"
          :active="viewMode === item.id"
          :tab-index="viewTabIndex(item.id)"
          @click="setViewMode(item.id)"
        >
          {{ item.label }}
        </TabButton>
      </SegmentedGroup>
    </div>

    <p v-if="pricingMode" class="ui-meta">{{ t("pricingDisclaimer") }}</p>
    <CompareChipBar
      :models="comparedModels"
      :show-compare="true"
      @remove="store.removeCompareModel"
      @clear="store.clearCompare"
      @compare="handleCompare"
    />
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
