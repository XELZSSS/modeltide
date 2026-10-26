<script setup lang="ts">
import { h } from "vue";
import { formatDollar, formatDurationMs, formatScore } from "@/shared/utils";
import type { DecisionIndexEntry } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";
import { useRankedColumns } from "@/client/hooks/use-rank-extras";
import RankedTableView from "@/client/components/table/ranked-table-view.vue";
import {
  modelNameCol,
  monoCol,
  rightCol,
  RightAlignedText,
  type DataTableColumn,
  type NameCellExtras,
} from "@/client/components/table/table-columns.ts";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import DecisionFacts from "@/client/pages/model/decision-facts.vue";

const props = defineProps<{ rankings: DecisionIndexEntry[] }>();

const rowIdOf = (row: DecisionIndexEntry) => row.id;
const rowNameOf = (row: DecisionIndexEntry) => row.name;

/**
 * Rank and detail link both come from the delivered order, which the source sorts by the index. The link opens the
 * contestant's own page rather than the Artificial Analysis model page the other rankings open: a contestant is a model
 * *at a reasoning effort*, and the decision-only models have no model page at all.
 */
const buildColumns = useRankedColumns(() => props.rankings, rowIdOf, "decision", buildDecisionColumns);

function buildDecisionColumns(
  tf: TFunction,
  extras: NameCellExtras<DecisionIndexEntry>,
): DataTableColumn<DecisionIndexEntry>[] {
  return [
    modelNameCol(tf("model"), rowNameOf, rowNameOf, { width: "45%", ...extras }),
    monoCol("index", tf("decisionIndex"), (row) => formatScore(row.index, tf), {
      mobilePrimary: true,
      emphasis: "strong",
    }),
    monoCol("costPerTask", tf("costPerTask"), (row) => formatDollar(row.costPerTaskUsd, tf), {
      emphasis: "muted",
    }),
    monoCol("timePerTask", tf("timePerTask"), (row) => formatDurationMs(row.timePerTaskMs, tf), {
      emphasis: "muted",
    }),
    rightCol("creator", tf("creator"), (row) =>
      h(RightAlignedText, { class: "ui-caption" }, () => row.creator || tf("unknown")),
    ),
  ];
}
</script>

<template>
  <RankedTableView
    :rows="rankings"
    :caption-key="'decisionRankings'"
    :get-row-id="rowIdOf"
    :get-row-name="rowNameOf"
    :get-search-fields="SEARCH_FIELDS.decision"
    :build-body-columns="buildColumns"
  >
    <template #expandedRow="{ row }">
      <DecisionFacts :entry="row" />
    </template>
  </RankedTableView>
</template>
