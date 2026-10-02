<script setup lang="ts">
import { computed, defineComponent, h, type VNodeChild } from "vue";
import { ExternalLink } from "@lucide/vue";
import {
  col,
  rightCol,
  RightAlignedText,
  type DataTableColumn,
} from "@/client/components/data/table/table-columns.vue";
import SearchableDataTable from "@/client/components/data/table/data-table.vue";
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import SearchInput from "@/client/search/search-input.vue";
import { useTranslation } from "@/client/i18n";
import { useSuspenseClosedReleasesState } from "@/client/api/api-queries";
import { formatDate, safeHref } from "@/client/utils/format";
import {
  buildClosedReleaseRows,
  getReleaseRowId,
  getReleaseSearchFields,
  type ReleaseRow,
} from "@/shared/utils/release-feed";

const { t } = useTranslation();

const getReleaseRowName = (row: ReleaseRow) => row.name;

const ReleasesData = defineComponent({
  async setup(_props, { slots }) {
    const { t: translate, lang } = useTranslation();
    const state = await useSuspenseClosedReleasesState();

    const rows = computed(() => buildClosedReleaseRows(state.value.items));

    const dateLabels = computed(() => {
      const labels = new Map<string, string>();
      for (const row of rows.value) labels.set(row.id, formatDate(row.date, lang.value));
      return labels;
    });

    const columns = computed<DataTableColumn<ReleaseRow>[]>(() => [
      col("model", translate("model"), (row) =>
        h("div", { class: "min-w-0" }, [
          h("p", { class: "text-sm truncate font-semibold", title: row.name }, row.name),
          h("div", { class: "flex md:hidden mt-1.5 items-center gap-2" }, [
            h("span", { class: "text-xs text-text-secondary" }, row.provider),
            h("span", { class: "ui-meta" }, dateLabels.value.get(row.id)!),
          ]),
        ]),
      ),
      rightCol(
        "provider",
        translate("provider"),
        (row) => h(RightAlignedText, { class: "text-sm" }, () => row.provider),
        {
          width: "24%",
          hiddenMd: true,
        },
      ),
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
      return h("div", { class: "flex flex-col gap-3 p-4 sm:p-5" }, [
        h(
          "a",
          {
            href,
            target: "_blank",
            rel: "noopener noreferrer",
            class:
              "group inline-flex items-center gap-1.5 text-sm text-accent w-fit underline-offset-4 transition-colors duration-fast hoverable:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          },
          [
            translate("aaModelPage"),
            h(ExternalLink, {
              size: 14,
              class: "md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-fast",
            }),
          ],
        ),
      ]);
    }

    return () =>
      slots.default?.({
        rows: rows.value,
        partial: state.value.partial,
        columns: columns.value,
        renderExpandedRow,
      }) ?? null;
  },
});
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('releases')" :description="t('releaseDataSources')">
      <template #actions>
        <SearchInput />
      </template>
    </PageHeader>
    <SuspenseQuery>
      <ReleasesData>
        <template #default="{ rows, partial, columns, renderExpandedRow }">
          <div class="flex items-center gap-2 -mt-2 mb-4">
            <span class="ui-meta tabular-nums">{{ t("events", { count: rows.length }) }}</span>
          </div>
          <PartialNotice v-if="partial" />
          <SearchableDataTable
            :data="rows"
            :columns="columns"
            :get-row-id="getReleaseRowId"
            :get-row-name="getReleaseRowName"
            :get-search-fields="getReleaseSearchFields"
            :render-expanded-row="renderExpandedRow"
          />
        </template>
      </ReleasesData>
    </SuspenseQuery>
  </PageContainer>
</template>
