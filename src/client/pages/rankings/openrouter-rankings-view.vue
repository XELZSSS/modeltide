<script setup lang="ts">
import { h } from "vue";
import RankedTableView from "@/client/components/table/ranked-table-view.vue";
import {
  modelNameCol,
  monoCol,
  rightCol,
  trendClass,
  RightAlignedText,
  type DataTableColumn,
  type NameCellExtras,
} from "@/client/components/table/table-columns.ts";
import OpenRouterModelDetail from "@/client/pages/model/openrouter-detail.vue";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { cn } from "@/client/utils/cn";
import { formatShortNumber, formatTrend } from "@/shared/utils";
import { useRankedColumns } from "@/client/hooks/use-rank-extras";
import type { TFunction } from "@/shared/i18n";
import type { OpenRouterRankEntry } from "@/shared/types";

function buildOpenRouterBodyColumns(
  t: TFunction,
  extras: NameCellExtras<OpenRouterRankEntry>,
): DataTableColumn<OpenRouterRankEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => item.name,
      { width: "45%", ...extras },
    ),
    monoCol("totalTokens", t("totalTokens"), (item) => formatShortNumber(item.totalTokens, t("notAvailable")), {
      mobilePrimary: true,
      emphasis: "strong",
    }),
    monoCol("inputTokens", t("inputTokens"), (item) => formatShortNumber(item.promptTokens, t("notAvailable")), {
      emphasis: "strong",
    }),
    monoCol("outputTokens", t("outputTokens"), (item) => formatShortNumber(item.completionTokens, t("notAvailable")), {
      emphasis: "strong",
    }),
    monoCol("requests", t("requests"), (item) => formatShortNumber(item.requestCount, t("notAvailable")), {
      emphasis: "muted",
    }),
    rightCol("creator", t("creator"), (item) =>
      h(RightAlignedText, { class: "ui-caption" }, () => item.creator || t("unknown")),
    ),
    rightCol("trend", t("trend"), (item) =>
      h(
        "span",
        { class: cn(trendClass(item.change), "inline-block font-mono ui-caption tabular-nums") },
        formatTrend(item.change, t),
      ),
    ),
  ];
}

const getModelRowId = (r: OpenRouterRankEntry) => r.id;
const getModelRowName = (r: OpenRouterRankEntry) => r.name;

const props = defineProps<{ rows: OpenRouterRankEntry[] }>();

// The usage ranking arrives ordered by the metric the tab sorts on, so a row's position in it is its rank; the name opens
// the OpenRouter detail page, which is also where the expanded row's own numbers come from.
const buildColumns = useRankedColumns(() => props.rows, getModelRowId, "or", buildOpenRouterBodyColumns);
</script>

<template>
  <RankedTableView
    :rows="props.rows"
    :caption-key="'openRouterRankings'"
    :get-row-id="getModelRowId"
    :get-row-name="getModelRowName"
    :get-search-fields="SEARCH_FIELDS.or"
    :build-body-columns="buildColumns"
  >
    <template #expandedRow="{ row }">
      <OpenRouterModelDetail :model="row" />
    </template>
  </RankedTableView>
</template>
