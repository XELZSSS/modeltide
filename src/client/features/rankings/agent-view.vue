<script setup lang="ts">
import { h } from "vue";
import { useSuspenseAgentRankingsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import type { AgentRankEntry } from "@/shared/types";
import RankedTableView, { modelNameCol } from "@/client/components/data/table/ranked-table-view.vue";
import TabStateShell from "@/client/components/data/tab-state-shell.vue";
import { orNA } from "@/client/utils/format";
import { rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns.ts";
import type { TFunction } from "@/shared/i18n";

function buildAgentColumns(t: TFunction): DataTableColumn<AgentRankEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => item.name,
    ),
    {
      id: "score",
      header: t("score"),
      align: "right",
      cell: (item) => {
        if (item.score == null || !Number.isFinite(item.score)) {
          return h("span", { class: "ui-mono-value font-semibold" }, t("notAvailable"));
        }
        const halfWidth =
          item.ciLower != null && item.ciUpper != null && Number.isFinite(item.ciLower) && Number.isFinite(item.ciUpper)
            ? (Math.abs(item.ciUpper - item.ciLower) / 2) * 100
            : null;
        return h("span", { class: "ui-mono-value inline-flex flex-col items-end leading-tight" }, [
          h("span", { class: "font-semibold" }, `${(item.score * 100).toFixed(2)}%`),
          halfWidth != null
            ? h("span", { class: "text-xs font-normal text-text-secondary" }, `±${halfWidth.toFixed(2)}%`)
            : null,
        ]);
      },
    },
    rightCol("creator", t("provider"), (item) => h("span", { class: "text-sm" }, item.creator), { hiddenMd: true }),
    rightCol("license", t("license"), (item) => h("span", { class: "text-sm" }, orNA(item.license, t)), {
      hiddenMd: true,
    }),
  ];
}

const getAgentRowId = (entry: AgentRankEntry) => `${entry.rank}|${entry.id}`;
const getAgentSearchFields = (entry: AgentRankEntry) => [entry.name, entry.id, entry.creator];

const state = await useSuspenseAgentRankingsState();
assertPayloadShape(state.value.malformed, "agentRankings");
</script>

<template>
  <TabStateShell :state="state">
    <RankedTableView
      :rows="state.items"
      :get-row-id="getAgentRowId"
      :get-search-fields="getAgentSearchFields"
      :build-body-columns="buildAgentColumns"
    />
  </TabStateShell>
</template>
