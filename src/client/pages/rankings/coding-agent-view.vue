<script setup lang="ts">
import { computed } from "vue";
import type { CodingAgentEntry } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";
import { rankMapOf } from "@/shared/utils/models";

import RankedTableView from "@/client/components/table/ranked-table-view.vue";
import { col, modelNameCol, monoCol, type DataTableColumn } from "@/client/components/table/table-columns.ts";
/**
 * One row per agent, at the model it scored highest on: the source already deduped the agent × model pairings and sorted
 * them by the Coding Agent Index, so this table's rank is its own row order rather than a field the payload carries —
 * read through the same position map the other ranking views use, keyed by the pairing id, instead of an `indexOf` that
 * walked the whole list again for every cell.
 *
 * The index is printed at the whole number AA shows, the same precision the home card uses, so the two surfaces never
 * disagree about a score. There is deliberately no detail link on the name: this ranks an *agent*, and the model column
 * carries AA's display string (for a router agent, several of them joined), not the slug a model page opens.
 */
const props = defineProps<{ rows: CodingAgentEntry[] }>();

const ranks = computed(() => rankMapOf(props.rows, (row) => row.id));
const rankOf = (row: CodingAgentEntry): number | null => ranks.value.get(row.id) ?? null;

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
