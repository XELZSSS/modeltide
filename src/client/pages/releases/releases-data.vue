<script setup lang="ts">
import { computed, h, watch, type VNodeChild } from "vue";
import { ExternalLink } from "@lucide/vue";
import { col, rightCol, RightAlignedText, type DataTableColumn } from "@/client/components/table/table-columns.ts";
import SearchableDataTable from "@/client/components/table/data-table.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import { useTranslation } from "@/client/i18n";
import { useSuspenseClosedReleasesState } from "@/client/api/hooks";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import { formatDate, safeHref } from "@/shared/utils";
import {
  buildClosedReleaseRows,
  getReleaseRowId,
  getReleaseSearchFields,
  type ReleaseRow,
} from "@/shared/utils/release-feed";

const { t: translate, lang } = useTranslation();

const state = await useSuspenseClosedReleasesState();

// A degraded/changelog-fallback list already arrives as `partial`; a malformed payload is a different failure and
// must reach the error boundary instead of rendering as an empty table.
watch(
  () => state.value.malformed,
  (malformed) => assertPayloadShape(malformed, "closedReleases"),
  { immediate: true },
);

const rows = computed(() => buildClosedReleaseRows(state.value.items));

const dateLabels = computed(() => {
  const labels = new Map<string, string>();
  for (const row of rows.value) labels.set(row.id, formatDate(row.date, lang.value));
  return labels;
});

const columns = computed<DataTableColumn<ReleaseRow>[]>(() => [
  col("model", translate("model"), (row) =>
    h("div", { class: "min-w-0" }, [
      h("p", { class: "text-sm font-semibold break-words md:truncate", title: row.name }, row.name),
      h("div", { class: "flex md:hidden mt-1.5 items-center gap-2" }, [
        h("span", { class: "text-xs text-text-secondary" }, row.provider),
        h("span", { class: "ui-meta" }, dateLabels.value.get(row.id)!),
      ]),
    ]),
  ),
  rightCol("provider", translate("provider"), (row) => h(RightAlignedText, { class: "text-sm" }, () => row.provider), {
    width: "24%",
    hiddenMd: true,
  }),
  rightCol(
    "releaseDate",
    translate("releaseDate"),
    (row) => h("span", { class: "ui-mono-value font-normal" }, dateLabels.value.get(row.id)!),
    { width: "18%", hiddenMd: true },
  ),
]);

function renderExpandedRow(row: ReleaseRow): VNodeChild {
  const href = safeHref(row.link);
  if (!href) return null;
  return h("div", { class: "flex flex-col gap-3" }, [
    h(
      "a",
      {
        href,
        target: "_blank",
        rel: "noopener noreferrer",
        class:
          "group inline-flex items-center gap-1.5 text-sm text-accent w-fit underline-offset-4 ui-motion hoverable:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
      },
      [
        translate("aaModelPage"),
        h(ExternalLink, {
          size: 14,
          class: "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ui-motion",
        }),
      ],
    ),
  ]);
}

const getRowName = (row: ReleaseRow) => row.name;
</script>

<template>
  <div class="flex flex-col gap-4">
    <span class="ui-meta tabular-nums">{{ translate("events", { count: rows.length }) }}</span>
    <PartialNotice v-if="state.partial" />
    <SearchableDataTable
      :data="rows"
      :columns="columns"
      :get-row-id="getReleaseRowId"
      :get-row-name="getRowName"
      :get-search-fields="getReleaseSearchFields"
      :render-expanded-row="renderExpandedRow"
    />
  </div>
</template>
