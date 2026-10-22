<script setup lang="ts">
import { computed, h } from "vue";
import { useSuspenseArtificialRankingsState } from "@/client/api/hooks";
import TabStateShell from "@/client/components/navigation/tab-state-shell.vue";
import SearchableDataTable from "@/client/components/table/data-table.vue";
import { col, monoCol, rightCol, type DataTableColumn } from "@/client/components/table/table-columns.ts";
import LabeledDot from "@/client/components/ui/labeled-dot.vue";
import { useTranslation } from "@/client/i18n";
import { formatPricePerMillion, formatScore, formatSpeed } from "@/shared/utils";
import { type ProviderStats } from "@/shared/utils/models";
import { useProviderStats } from "./provider-stats";

const state = await useSuspenseArtificialRankingsState();

const { t } = useTranslation();

const providerStats = useProviderStats(
  computed(() => state.value.items),
  t,
);

const columns = computed<DataTableColumn<ProviderStats>[]>(() => [
  col("name", t("provider"), (p) => h(LabeledDot, { color: p.color, title: p.name }, () => p.name)),
  monoCol("count", t("modelCount"), (p) => p.count),
  monoCol("avgIntelligence", t("avgIntelligence"), (p) => formatScore(p.avgIntelligence, t), {
    mobilePrimary: true,
  }),
  monoCol("avgPrice", t("avgPrice"), (p) => formatPricePerMillion(p.avgInputPrice, t), { hiddenMd: true }),
  rightCol(
    "avgSpeed",
    t("avgSpeed"),
    (p) =>
      h(
        "span",
        { class: "text-sm text-text-primary" },
        p.avgSpeed != null ? `${formatSpeed(p.avgSpeed, t)} ${t("tokensPerSecond")}` : t("notAvailable"),
      ),
    { hiddenMd: true },
  ),
]);

const getProviderRowId = (p: ProviderStats) => p.name;
const getProviderSearchFields = (p: ProviderStats) => [p.name];
</script>

<template>
  <TabStateShell :state="state" domain="artificialIndex">
    <SearchableDataTable
      :columns="columns"
      :data="providerStats"
      :get-row-id="getProviderRowId"
      :get-search-fields="getProviderSearchFields"
    />
  </TabStateShell>
</template>
