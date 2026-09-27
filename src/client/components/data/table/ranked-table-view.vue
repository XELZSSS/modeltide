<script lang="ts">
import { h } from "vue";
import RankingNameCell, { type DataTableColumn } from "./table-columns.vue";

export function modelNameCol<T>(
  header: string,
  titleOf: (row: T) => string,
  textOf: (row: T) => string,
  width = "40%",
): DataTableColumn<T> {
  return {
    id: "model",
    header,
    width,
    cell: (row) => {
      const title = titleOf(row);
      const text = textOf(row);
      return h(RankingNameCell, { name: text, title });
    },
  };
}
</script>

<script setup lang="ts" generic="T">
import { computed, type VNodeChild } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TFunction } from "@/shared/i18n";
import SearchableDataTable from "./data-table.vue";

const props = defineProps<{
  rows: T[];
  getRowId: (row: T) => string;
  getRowName?: (row: T) => string;
  getSearchFields: (row: T) => (string | null | undefined)[];
  buildBodyColumns: (t: TFunction) => DataTableColumn<T>[];
  renderExpandedRow?: (row: T) => VNodeChild;
}>();

const { t } = useTranslation();

defineSlots<{ expandedRow?: (props: { row: T }) => VNodeChild }>();

const columns = computed(() => props.buildBodyColumns(t));
</script>

<template>
  <SearchableDataTable
    :data="rows"
    :columns="columns"
    :get-row-id="getRowId"
    :get-row-name="getRowName"
    :get-search-fields="getSearchFields"
    :render-expanded-row="renderExpandedRow"
  >
    <template v-if="$slots.expandedRow" #expandedRow="slotProps">
      <slot name="expandedRow" v-bind="slotProps" />
    </template>
  </SearchableDataTable>
</template>
