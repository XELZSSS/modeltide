<script setup lang="ts">
import type { CodingAgentEntry } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";

import RankedTableView from "@/client/components/table/ranked-table-view.vue";
import { col, modelNameCol, monoCol, type DataTableColumn } from "@/client/components/table/table-columns.ts";

/**
 * One row per agent, at the model it scored highest on: the source already deduped the agent × model pairings and sorted
 * them by the Coding Agent Index, so this table's rank is its own row order rather than a field the payload carries.
 *
 * The index is printed at the whole number AA shows, the same precision the home card uses, so the two surfaces never
 * disagree about a score.
 */
const props = defineProps<{ rows: CodingAgentEntry[] }>();

const rankOf = (row: CodingAgentEntry): number => props.rows.indexOf(row) + 1;

function buildColumns(t: TFunction): DataTableColumn<CodingAgentEntry>[] {
  return [
    modelNameCol(t("codingAgents"), (row) => row.agent, { rankOf }),
    col("creator", t("creator"), (row) => row.creator ?? t("notAvailable"), { hiddenMd: true }),
    col("model", t("model"), (row) => row.model ?? t("notAvailable")),
    monoCol("score", t("codingAgentIndex"), (row) => String(Math.round(row.score)), {
      emphasis: "strong",
      mobilePrimary: true,
    }),
  ];
}

const getRowId = (row: CodingAgentEntry): string => row.id;
const getSearchFields = (row: CodingAgentEntry): string[] =>
  row.creator == null ? [row.agent] : [row.agent, row.creator];
</script>

<template>
  <RankedTableView
    :rows="rows"
    caption-key="codingAgentRankings"
    :get-row-id="getRowId"
    :get-search-fields="getSearchFields"
    :build-body-columns="buildColumns"
  />
</template>
