<script setup lang="ts">
import { formatIndex, formatPercent } from "@/client/utils/format";
import type { HallucinationRankingEntry } from "@/shared/types";
import RankedTableView, { modelNameCol } from "@/client/components/data/table/ranked-table-view.vue";
import { monoCol, type DataTableColumn } from "@/client/components/data/table/table-columns.vue";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import type { TFunction } from "@/shared/i18n";

function buildHallColumns(t: TFunction): DataTableColumn<HallucinationRankingEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.model,
      (item) => item.model,
    ),
    monoCol("hallucinationRate", t("hallucinationRate"), (item) => formatPercent(item.hallucinationRate, t), {
      emphasis: "strong",
    }),
    monoCol("accuracy", t("accuracy"), (item) => formatPercent(item.accuracy, t), { hiddenMd: true }),
    monoCol("attemptRate", t("attemptRate"), (item) => formatPercent(item.attemptRate, t), { hiddenMd: true }),
    monoCol("omniscienceIndex", t("omniscienceIndex"), (item) => formatIndex(item.omniscienceIndex, t("notAvailable")), {
      hiddenMd: true,
    }),
  ];
}

const getHallRowId = (entry: HallucinationRankingEntry) => entry.id || entry.slug || entry.model;

defineProps<{ rankings: HallucinationRankingEntry[] }>();
</script>

<template>
  <RankedTableView
    :rows="rankings"
    :get-row-id="getHallRowId"
    :get-search-fields="SEARCH_FIELDS.hall"
    :build-body-columns="buildHallColumns"
  />
</template>
