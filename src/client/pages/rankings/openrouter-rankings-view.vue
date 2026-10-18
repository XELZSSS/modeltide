<script setup lang="ts">
import { h } from "vue";
import RankedTableView, { modelNameCol } from "@/client/components/table/ranked-table-view.vue";
import {
  mobilePrimaryCol,
  monoCol,
  rightCol,
  trendClass,
  RightAlignedText,
  type DataTableColumn,
} from "@/client/components/table/table-columns.ts";
import OpenRouterModelDetail from "@/client/pages/model/openrouter-detail.vue";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { cn } from "@/client/utils/cn";
import { formatShortNumber, formatTrend } from "@/shared/utils";
import type { TFunction } from "@/shared/i18n";
import type { OpenRouterRankEntry } from "@/shared/types";

function buildOpenRouterBodyColumns(t: TFunction): DataTableColumn<OpenRouterRankEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => item.name,
      "45%",
    ),
    monoCol("totalTokens", t("totalTokens"), (item) => formatShortNumber(item.totalTokens, t("notAvailable")), {
      mobilePrimary: true,
      emphasis: "strong",
    }),
    monoCol("inputTokens", t("inputTokens"), (item) => formatShortNumber(item.promptTokens, t("notAvailable")), {
      hiddenMd: true,
      emphasis: "strong",
    }),
    monoCol("outputTokens", t("outputTokens"), (item) => formatShortNumber(item.completionTokens, t("notAvailable")), {
      hiddenMd: true,
      emphasis: "strong",
    }),
    monoCol("requests", t("requests"), (item) => formatShortNumber(item.requestCount, t("notAvailable")), {
      emphasis: "muted",
    }),
    rightCol("creator", t("creator"), (item) =>
      h(RightAlignedText, { class: "ui-caption" }, () => item.creator || t("unknown")),
    ),
    mobilePrimaryCol("trend", t("trend"), (item) =>
      h(
        "span",
        { class: cn(trendClass(item.change), "text-xs font-mono tabular-nums inline-block") },
        formatTrend(item.change, t),
      ),
    ),
  ];
}

const getModelRowId = (r: OpenRouterRankEntry) => r.id;
const getModelRowName = (r: OpenRouterRankEntry) => r.name;

const props = defineProps<{ rows: OpenRouterRankEntry[] }>();
</script>

<template>
  <RankedTableView
    :rows="props.rows"
    :get-row-id="getModelRowId"
    :get-row-name="getModelRowName"
    :get-search-fields="SEARCH_FIELDS.or"
    :build-body-columns="buildOpenRouterBodyColumns"
  >
    <template #expandedRow="{ row }">
      <OpenRouterModelDetail :model="row" />
    </template>
  </RankedTableView>
</template>
