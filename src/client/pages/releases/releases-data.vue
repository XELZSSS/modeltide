<script setup lang="ts">
import { computed, h, withDirectives, type VNodeChild } from "vue";
import { vTooltip } from "@/client/directives/tooltip";
import { ExternalLink } from "@lucide/vue";
import { col, rightCol, RightAlignedText, type DataTableColumn } from "@/client/components/table/table-columns.ts";
import SearchableDataTable from "@/client/components/table/data-table.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import { useTranslation } from "@/client/i18n";
import { useSuspenseClosedReleasesState } from "@/client/api/view-models";
import { useMalformedGuard } from "@/client/hooks/use-malformed-guard";
import { useRouteSearchTerm } from "@/client/hooks/use-route-search-term";
import { filterByTerm } from "@/client/search/match";
import { FOCUS_RING } from "@/client/components/ui/interactive-classes";
import { formatDate, safeHref } from "@/shared/utils";
import {
  buildClosedReleaseRows,
  getReleaseRowId,
  getReleaseSearchFields,
  type ReleaseRow,
} from "@/shared/utils/release-feed";

const { t: translate, lang } = useTranslation();

const state = await useSuspenseClosedReleasesState();

// A malformed payload is a failure, not an empty table; see `use-malformed-guard.ts`.
useMalformedGuard(() => state.value.malformed, "closedReleases");

const rows = computed(() => buildClosedReleaseRows(state.value.items));

const { term } = useRouteSearchTerm();

// What the table below actually shows: `data-table` filters by the same route term, so counting the whole feed read as a
// lie the moment a search narrowed the list ("1,204 events" over three rows).
const visibleRows = computed(() => filterByTerm(rows.value, term.value, getReleaseSearchFields));

const dateLabels = computed(() => {
  const labels = new Map<string, string>();
  for (const row of rows.value) labels.set(row.id, formatDate(row.date, lang.value));
  return labels;
});

const columns = computed<DataTableColumn<ReleaseRow>[]>(() => [
  col("model", translate("model"), (row) =>
    h("div", { class: "min-w-0" }, [
      withDirectives(h("p", { class: "ui-body font-medium break-words md:truncate" }, row.name), [
        [vTooltip, row.name],
      ]),
      h("div", { class: "mt-1.5 flex min-w-0 items-center gap-2 md:hidden" }, [
        h("span", { class: "min-w-0 truncate ui-caption" }, row.provider),
        h("span", { class: "shrink-0 ui-meta" }, dateLabels.value.get(row.id)!),
      ]),
    ]),
  ),
  rightCol("provider", translate("provider"), (row) => h(RightAlignedText, { class: "ui-body" }, () => row.provider), {
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
  if (!href) return h("p", { class: "ui-caption" }, translate("notAvailable"));
  return h("div", { class: "flex flex-col gap-3" }, [
    h(
      "a",
      {
        href,
        target: "_blank",
        rel: "noopener noreferrer",
        class: `group inline-flex items-center gap-1.5 ui-body w-fit underline-offset-4 ui-motion hoverable:hover:underline ${FOCUS_RING}`,
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
    <span class="ui-meta tabular-nums">{{ translate("events", { count: visibleRows.length }) }}</span>
    <PartialNotice v-if="state.partial" />
    <SearchableDataTable
      :data="rows"
      :columns="columns"
      :caption-key="'navReleases'"
      :get-row-id="getReleaseRowId"
      :get-row-name="getRowName"
      :get-search-fields="getReleaseSearchFields"
      :render-expanded-row="renderExpandedRow"
    />
  </div>
</template>
