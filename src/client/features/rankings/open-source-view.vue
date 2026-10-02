<script setup lang="ts">
import { h } from "vue";
import { formatShortNumber, orNA } from "@/client/utils/format";
import { shortModelId } from "@/shared/utils/models";
import type { OpenSourceModelEntry } from "@/shared/types";
import RankedTableView, { modelNameCol } from "@/client/components/data/table/ranked-table-view.vue";
import { monoCol, rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns.vue";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import type { TFunction } from "@/shared/i18n";

function buildOpenSourceColumns(t: TFunction): DataTableColumn<OpenSourceModelEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.id,
      (item) => shortModelId(item.id),
    ),
    monoCol("downloads", t("downloads"), (item) => formatShortNumber(item.downloads, t("notAvailable")), {
      emphasis: "strong",
    }),
    monoCol("likes", t("likes"), (item) => formatShortNumber(item.likes, t("notAvailable")), { hiddenMd: true }),
    rightCol("license", t("license"), (item) => h("span", { class: "text-sm" }, orNA(item.license, t)), {
      hiddenMd: true,
    }),
  ];
}

const getOpenSourceRowId = (model: OpenSourceModelEntry) => model.id;

defineProps<{ rankings: OpenSourceModelEntry[] }>();
</script>

<template>
  <RankedTableView
    :rows="rankings"
    :get-row-id="getOpenSourceRowId"
    :get-search-fields="SEARCH_FIELDS.os"
    :build-body-columns="buildOpenSourceColumns"
  />
</template>
