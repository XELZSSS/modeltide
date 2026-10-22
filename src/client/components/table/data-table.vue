<script setup lang="ts" generic="T extends object">
import { computed, ref, useSlots, watch, type VNodeChild } from "vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import Pagination from "@/client/components/navigation/pagination.vue";
import { useTranslation } from "@/client/i18n";
import { useDevice } from "@/client/device";
import { filterByTerm, foldSearchStr } from "@/client/search/match";
import { useRouteSearchTerm } from "@/client/hooks/use-route-search-term";
import type { DataTableColumn, RowAccessors } from "./table-columns.ts";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, usePagedData } from "./paging";
import { rowKeyOf } from "./use-row-list";
import TableBody, { TableHeader } from "./desktop.vue";
import MobileTableBody from "./mobile.vue";

const props = defineProps<
  RowAccessors<T> & {
    data: T[];
    columns: DataTableColumn<T>[];
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
const bodyEl = ref<HTMLDivElement | null>(null);

const { dedupedData, page, totalPages, pagedData, goToPage } = usePagedData(
  () => filtered.value,
  (row: T) => props.getRowId(row),
  () => (isMobile.value ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE),
  () => term.value,
);

const datasetSignature = computed(() => dedupedData.value.map((row) => props.getRowId(row)).join("\u0000"));
const staggerRows = ref(true);
watch(datasetSignature, () => {
  staggerRows.value = true;
});

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

function setExpandedId(rowId: string | null): void {
  expandedId.value = rowId;
}

function handlePageChange(next: number): void {
  if (next !== page.value) staggerRows.value = false;
  goToPage(next);
  expandedId.value = null;
  bodyEl.value?.focus({ preventScroll: true });
}
</script>

<template>
  <div class="flex flex-col gap-4 min-w-0">
    <EmptyState v-if="dedupedData.length === 0" :message="emptyMessage" />
    <template v-else>
      <div ref="bodyEl" tabindex="-1" class="flex flex-col gap-4 min-w-0 outline-none">
        <MobileTableBody
          v-if="isMobile"
          :paged-data="pagedData"
          :columns="columns"
          :get-row-id="getRowId"
          :get-row-name="getRowName"
          :is-expandable="isExpandable"
          :expanded-row-id="expandedId"
          :render-expanded-row="renderExpanded"
          :stagger="staggerRows"
          @toggle-expand="setExpandedId"
        />
        <div v-else class="ui-card overflow-x-auto">
          <table class="w-full text-sm table-fixed">
            <TableHeader :columns="columns" :is-expandable="isExpandable" />
            <TableBody
              :paged-data="pagedData"
              :columns="columns"
              :get-row-id="getRowId"
              :get-row-name="getRowName"
              :is-expandable="isExpandable"
              :expanded-row-id="expandedId"
              :render-expanded-row="renderExpanded"
              :stagger="staggerRows"
              @toggle-expand="setExpandedId"
            />
          </table>
        </div>
      </div>
      <Pagination :page="page" :total-pages="totalPages" @change="handlePageChange" />
    </template>
  </div>
</template>
