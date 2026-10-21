<script lang="ts">
export { modelNameCol } from "./table-columns.ts";
</script>

<script setup lang="ts" generic="T extends object">
import { computed, type VNodeChild } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TFunction } from "@/shared/i18n";
import SearchableDataTable from "./data-table.vue";
import type { DataTableColumn, RowAccessors } from "./table-columns.ts";

const props = defineProps<
  RowAccessors<T> & {
    rows: T[];
    getSearchFields: (row: T) => (string | null | undefined)[];
    buildBodyColumns: (t: TFunction) => DataTableColumn<T>[];
    renderExpandedRow?: (row: T) => VNodeChild;
  }
>();

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
