<script setup lang="ts">
import { h } from "vue";
import { formatShortNumber, orNA } from "@/shared/utils";
import { shortModelId } from "@/shared/utils/models";
import { useRankExtras } from "@/client/hooks/use-rank-extras";
import type { OpenSourceModelEntry } from "@/shared/types";
import RankedTableView from "@/client/components/table/ranked-table-view.vue";
import {
  modelNameCol,
  monoCol,
  rightCol,
  type DataTableColumn,
  type NameCellExtras,
} from "@/client/components/table/table-columns.ts";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import type { TFunction } from "@/shared/i18n";
import OpenSourceModelDetail from "./os/os-cells.vue";

function buildOpenSourceColumns(
  t: TFunction,
  extras?: NameCellExtras<OpenSourceModelEntry>,
): DataTableColumn<OpenSourceModelEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.id,
      (item) => shortModelId(item.id),
      extras,
    ),
    monoCol("downloads", t("downloads"), (item) => formatShortNumber(item.downloads, t("notAvailable")), {
      emphasis: "strong",
    }),
    monoCol("likes", t("likes"), (item) => formatShortNumber(item.likes, t("notAvailable"))),
    rightCol("license", t("license"), (item) => h("span", { class: "text-sm" }, orNA(item.license, t))),
  ];
}

const props = defineProps<{ rankings: OpenSourceModelEntry[] }>();

// The server answers this list in trending-score order, so the delivered order *is* the ranking: the row's position is
// what the name cell prints, and it links to the same detail page the search box opens.
const rowExtras = useRankExtras(
  () => props.rankings,
  (item) => item.id,
  "os",
);

const getOpenSourceRowId = (model: OpenSourceModelEntry) => model.id;

const buildColumns = (t: TFunction): DataTableColumn<OpenSourceModelEntry>[] =>
  buildOpenSourceColumns(t, rowExtras.value);
</script>

<template>
  <RankedTableView
    :rows="rankings"
    :get-row-id="getOpenSourceRowId"
    :get-search-fields="SEARCH_FIELDS.os"
    :build-body-columns="buildColumns"
  >
    <template #expandedRow="{ row }">
      <OpenSourceModelDetail :model="row" />
    </template>
  </RankedTableView>
</template>
