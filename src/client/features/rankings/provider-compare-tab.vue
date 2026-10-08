<script setup lang="ts">
import { computed, h } from "vue";
import { useSuspenseArtificialRankingsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import SearchableDataTable from "@/client/components/data/table/data-table.vue";
import { col, monoCol, rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns.ts";
import TabStateShell from "@/client/components/data/tab-state-shell.vue";
import LabeledDot from "@/client/components/ui/labeled-dot.vue";
import { useTranslation } from "@/client/i18n";
import { formatPricePerMillion, formatScore, formatSpeed } from "@/client/utils/format";
import { computeProviderStats, type ProviderStats } from "@/shared/utils/models";

const state = await useSuspenseArtificialRankingsState();
assertPayloadShape(state.value.malformed, "artificialIndex");

const { t } = useTranslation();

const providerStats = computed(() => computeProviderStats(state.value.items, t("unknown")));

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
  <TabStateShell :state="state">
    <SearchableDataTable
      :columns="columns"
      :data="providerStats"
      :get-row-id="getProviderRowId"
      :get-search-fields="getProviderSearchFields"
    />
  </TabStateShell>
</template>
