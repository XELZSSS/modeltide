<script setup lang="ts">
import { computed, h } from "vue";
import { ShieldAlert } from "@lucide/vue";
import RankedTableView, { modelNameCol } from "@/client/components/data/table/ranked-table-view.vue";
import {
  mobilePrimaryCol,
  monoCol,
  rightCol,
  trendClass,
  RightAlignedText,
  type DataTableColumn,
} from "@/client/components/data/table/table-columns.ts";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import OpenRouterModelDetail from "@/client/components/model-detail/openrouter-detail.vue";
import { useTranslation } from "@/client/i18n";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { assertPayloadShape, unwrapListPartial } from "@/client/api/payload-normalize";
import { cn } from "@/client/utils/cn";
import { formatShortNumber, formatTrend } from "@/client/utils/format";
import type { TFunction } from "@/shared/i18n";
import type { OpenRouterRankEntry, SourcePayload } from "@/shared/types";

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

const props = defineProps<{ data?: SourcePayload<OpenRouterRankEntry[]> }>();

const { t } = useTranslation();

const state = computed(() => {
  const value = props.data ? unwrapListPartial<OpenRouterRankEntry>(props.data, "openRouterRankings") : null;
  assertPayloadShape(value?.malformed ?? false, "openRouterRankings");
  return value;
});
</script>

<template>
  <EmptyState v-if="!state" :icon="ShieldAlert" :message="t('noRankingsData')" />
  <template v-else>
    <PartialNotice v-if="state.partial" />
    <RankedTableView
      :rows="state.data"
      :get-row-id="getModelRowId"
      :get-row-name="getModelRowName"
      :get-search-fields="SEARCH_FIELDS.or"
      :build-body-columns="buildOpenRouterBodyColumns"
    >
      <template #expandedRow="{ row }">
        <div class="p-4 sm:p-5">
          <OpenRouterModelDetail :model="row" />
        </div>
      </template>
    </RankedTableView>
  </template>
</template>
