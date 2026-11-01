<script setup lang="ts">
import { formatDollar, formatPercent, formatScore, formatTokens } from "@/shared/utils";
import type { CursorBenchEntry } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";

import RankedTableView from "@/client/components/table/ranked-table-view.vue";
import { modelNameCol, monoCol, type DataTableColumn } from "@/client/components/table/table-columns.ts";

/**
 * Cursor prints the effort variant into the model label (`Opus 5.5 Max`), so the rank badge is the page's own number and
 * the name is not a link: a CursorBench label identifies a ranked entry, not a model this app has a page for.
 */
function buildCursorBenchColumns(t: TFunction): DataTableColumn<CursorBenchEntry>[] {
  return [
    modelNameCol(t("model"), (row) => row.model, { rankOf: (row) => row.rank }),
    monoCol("score", t("score"), (row) => formatPercent(row.score, t), {
      emphasis: "strong",
      mobilePrimary: true,
    }),
    monoCol("costPerTask", t("costPerTask"), (row) => formatDollar(row.costPerTask, t)),
    monoCol("tokensPerTask", t("tokensPerTask"), (row) => formatTokens(row.tokensPerTask, t), { hiddenMd: true }),
    monoCol("stepsPerTask", t("stepsPerTask"), (row) => formatScore(row.stepsPerTask, t), { hiddenMd: true }),
  ];
}

defineProps<{ rows: CursorBenchEntry[] }>();

const getRowId = (row: CursorBenchEntry): string => row.id;
const getSearchFields = (row: CursorBenchEntry): string[] => [row.model];
</script>

<template>
  <RankedTableView
    :rows="rows"
    caption-key="cursorBenchRankings"
    :get-row-id="getRowId"
    :get-search-fields="getSearchFields"
    :build-body-columns="buildCursorBenchColumns"
  />
</template>
