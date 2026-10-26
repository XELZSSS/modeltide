<script setup lang="ts">
import { h } from "vue";
import { formatShortNumber, orNA } from "@/shared/utils";
import { shortModelId } from "@/shared/utils/models";
import { useRankedColumns } from "@/client/hooks/use-rank-extras";
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
import OpenSourceExpandedRow from "./os/open-source-expanded-row.vue";

function buildOpenSourceColumns(
  t: TFunction,
  extras: NameCellExtras<OpenSourceModelEntry>,
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
    rightCol("license", t("license"), (item) => h("span", { class: "ui-body" }, orNA(item.license, t))),
  ];
}

const props = defineProps<{ rankings: OpenSourceModelEntry[] }>();

const getOpenSourceRowId = (model: OpenSourceModelEntry) => model.id;

// The server answers this list in trending-score order, so the delivered order *is* the ranking: the row's position is
// what the name cell prints, and it links to the same detail page the search box opens.
const buildColumns = useRankedColumns(() => props.rankings, getOpenSourceRowId, "os", buildOpenSourceColumns);
</script>

<template>
  <RankedTableView
    :rows="rankings"
    :caption-key="'openSourceRankings'"
    :get-row-id="getOpenSourceRowId"
    :get-search-fields="SEARCH_FIELDS.os"
    :build-body-columns="buildColumns"
  >
    <template #expandedRow="{ row }">
      <OpenSourceExpandedRow :model="row" />
    </template>
  </RankedTableView>
</template>
