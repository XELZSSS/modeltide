<script setup lang="ts" generic="T extends object">
import { computed, ref, useSlots, watch, type VNodeChild } from "vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import Pagination from "@/client/components/navigation/pagination.vue";
import { useTranslation } from "@/client/i18n";
import { useDevice } from "@/client/device";
import { filterByTerm, foldSearchStr } from "@/client/search/match";
import { useRouteSearchTerm } from "@/client/hooks/use-route-search-term";
import type { DataTableColumn, RowAccessors } from "./table-columns.ts";
import type { TranslationKey } from "@/shared/i18n";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, usePagedData } from "./paging";
import { rowKeyOf } from "./use-row-list";
import TableBody from "./desktop.vue";
import { TableHeader } from "./table-header.ts";
import MobileTableBody from "./mobile.vue";

/**
 * The searchable, paged table. It owns what the two bodies must not each own: filtering by the route's search term,
 * page state (a different page size per device), which row is expanded, and the empty state that replaces both bodies
 * when nothing matches. Both bodies receive the same bindings, so a contract change reaches the desktop table and the
 * phone card list at once.
 */
const props = defineProps<
  RowAccessors<T> & {
    data: T[];
    columns: DataTableColumn<T>[];
    /**
     * The table's accessible name: every rankings table is a landmark of its own, so an unnamed one is announced bare.
     * A key rather than a string keeps the name in the dictionary the rest of the view reads.
     */
    captionKey: TranslationKey;
    getSearchFields: (row: T) => (string | null | undefined)[];
    renderExpandedRow?: (row: T) => VNodeChild;
  }
>();

defineSlots<{ expandedRow?: (props: { row: T }) => VNodeChild }>();

const slots = useSlots();
const isMobile = useDevice();
const { t } = useTranslation();
const { term } = useRouteSearchTerm();

const filtered = computed(() => filterByTerm(props.data, term.value, props.getSearchFields));
const emptyMessage = computed(() => (foldSearchStr(term.value) === "" ? t("noData") : t("noResults")));
const expandedId = ref<string | null>(null);
const isExpandable = computed(() => props.renderExpandedRow != null || slots.expandedRow != null);
const renderExpanded = computed<(row: T) => VNodeChild>(
  () => props.renderExpandedRow ?? ((row: T) => slots.expandedRow?.({ row }) ?? null),
);
const { dedupedData, page, totalPages, pagedData, goToPage } = usePagedData(
  () => filtered.value,
  (row: T) => props.getRowId(row),
  () => (isMobile.value ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE),
  () => term.value,
);

const expandedRowGone = computed(
  () =>
    expandedId.value != null &&
    !pagedData.value.some((row, index) => rowKeyOf(props.getRowId, row, index) === expandedId.value),
);

watch(
  expandedRowGone,
  (gone) => {
    if (gone) expandedId.value = null;
  },
  { immediate: true },
);

/** The prop set shared by both bodies; see `RowListProps` in table-columns.ts. */
const bodyBindings = computed(() => ({
  pagedData: pagedData.value,
  columns: props.columns,
  getRowId: props.getRowId,
  getRowName: props.getRowName,
  isExpandable: isExpandable.value,
  expandedRowId: expandedId.value,
  renderExpandedRow: renderExpanded.value,
}));

function setExpandedId(rowId: string | null): void {
  expandedId.value = rowId;
}

// Focus stays on the pager. The page number is already announced by the control's own `aria-live`, while moving focus
// into the table body meant Enter on the pager did nothing afterwards and a keyboard user had to Tab through the
// whole new page to reach it again.
function handlePageChange(next: number): void {
  goToPage(next);
  expandedId.value = null;
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <EmptyState v-if="dedupedData.length === 0" :message="emptyMessage" />
    <template v-else>
      <MobileTableBody v-if="isMobile" v-bind="bodyBindings" @toggle-expand="setExpandedId" />
      <div v-else class="ui-card overflow-x-auto">
        <table class="w-full table-fixed text-sm">
          <caption class="sr-only">
            {{
              t(captionKey)
            }}
          </caption>
          <TableHeader :columns="columns" :is-expandable="isExpandable" />
          <TableBody v-bind="bodyBindings" @toggle-expand="setExpandedId" />
        </table>
      </div>
      <Pagination :page="page" :total-pages="totalPages" @change="handlePageChange" />
    </template>
  </div>
</template>
