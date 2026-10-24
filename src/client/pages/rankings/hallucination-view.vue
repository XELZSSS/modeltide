<script setup lang="ts">
import { h, type VNodeChild } from "vue";
import { formatIndex, formatPercent } from "@/shared/utils";
import type { ArtificialAnalysisModel, HallucinationRankingEntry } from "@/shared/types";
import { modelId } from "@/shared/utils/models";
import { useRankExtras } from "@/client/hooks/use-rank-extras";
import RankedTableView from "@/client/components/table/ranked-table-view.vue";
import {
  modelNameCol,
  monoCol,
  type DataTableColumn,
  type NameCellExtras,
} from "@/client/components/table/table-columns.ts";
import { RenderView } from "@/client/components/table/cell-view";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import ModelDetailContent from "@/client/pages/model/aa-detail.vue";
import { findAaModelForHallEntry } from "@/client/utils/hall-aa-model";
import { useTranslation } from "@/client/i18n";
import type { TFunction } from "@/shared/i18n";

function buildHallColumns(
  t: TFunction,
  extras?: NameCellExtras<HallucinationRankingEntry>,
): DataTableColumn<HallucinationRankingEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.model,
      (item) => item.model,
      extras,
    ),
    monoCol("hallucinationRate", t("hallucinationRate"), (item) => formatPercent(item.hallucinationRate, t), {
      emphasis: "strong",
    }),
    monoCol("accuracy", t("accuracy"), (item) => formatPercent(item.accuracy, t)),
    monoCol("attemptRate", t("attemptRate"), (item) => formatPercent(item.attemptRate, t)),
    monoCol("omniscienceIndex", t("omniscienceIndex"), (item) => formatIndex(item.omniscienceIndex, t("notAvailable"))),
  ];
}

// Identity comes from `modelId`, the same helper the search links and the router's lookup use. The display name is a
// label, not a key: falling back to it would make a renamed model lose its expanded row and its row identity.
const getHallRowId = (entry: HallucinationRankingEntry) => modelId(entry);

/**
 * `models` is the AA index the rows were derived from, handed down by the tab: the expanded row shows the benchmarks the
 * ranking itself cannot carry, which only the AA model has, and the row's `id` identifies that model exactly.
 */
const props = defineProps<{ rankings: HallucinationRankingEntry[]; models: ArtificialAnalysisModel[] }>();

const { t } = useTranslation();

const rankExtras = useRankExtras(() => props.rankings, getHallRowId, "hall");

const buildColumns = (t2: TFunction): DataTableColumn<HallucinationRankingEntry>[] =>
  buildHallColumns(t2, rankExtras.value);

function renderHallDetail(entry: HallucinationRankingEntry): VNodeChild {
  const model = findAaModelForHallEntry(props.models, entry);
  if (!model) return h("p", { class: "ui-caption" }, t("notAvailable"));
  return h(ModelDetailContent, { model, showBenchmarks: false });
}
</script>

<template>
  <RankedTableView
    :rows="rankings"
    :get-row-id="getHallRowId"
    :get-search-fields="SEARCH_FIELDS.hall"
    :build-body-columns="buildColumns"
  >
    <template #expandedRow="{ row }">
      <RenderView :render="() => renderHallDetail(row)" />
    </template>
  </RankedTableView>
</template>
