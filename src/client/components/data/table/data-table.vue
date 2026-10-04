<script setup lang="ts" generic="T extends object">
import { computed, ref, useSlots, watch, type VNodeChild } from "vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import Pagination from "@/client/components/ui/pagination.vue";
import { useTranslation } from "@/client/i18n";
import { useDevice } from "@/client/device";
import { filterByTerm } from "@/client/search/match";
import { useRouteSearchTerm } from "@/client/stores";
import type { DataTableColumn } from "./table-columns.ts";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, usePagedData } from "./paging";
import TableBody, { TableHeader } from "./desktop.vue";
import MobileTableBody from "./mobile.vue";

const props = defineProps<{
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  getRowName?: (row: T) => string;
  getSearchFields: (row: T) => (string | null | undefined)[];
  renderExpandedRow?: (row: T) => VNodeChild;
}>();

defineSlots<{ expandedRow?: (props: { row: T }) => VNodeChild }>();

const slots = useSlots();
const isMobile = useDevice();
const { t } = useTranslation();
const { term } = useRouteSearchTerm();

const filtered = computed(() => filterByTerm(props.data, term.value, props.getSearchFields));
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

const expandedRowGone = computed(
  () => expandedId.value != null && !dedupedData.value.some((row) => props.getRowId(row) === expandedId.value),
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

function handlePageChange(p: number): void {
  goToPage(p);
  expandedId.value = null;
  bodyEl.value?.focus({ preventScroll: true });
}
</script>

<template>
  <div class="flex flex-col gap-4 min-w-0">
    <EmptyState v-if="dedupedData.length === 0" :message="t('noResults')" />
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
              @toggle-expand="setExpandedId"
            />
          </table>
        </div>
      </div>
      <Pagination :page="page" :total-pages="totalPages" @change="handlePageChange" />
    </template>
  </div>
</template>
