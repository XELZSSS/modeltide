<script setup lang="ts" generic="T">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import type { DataTableColumn, RowListProps } from "./table-columns.vue";
import { CellView, useRowList, type RowListEmits } from "./row-list";
import ExpandToggle, { ExpandedRowPanel } from "./row-expand.vue";

const props = defineProps<RowListProps<T>>();

const emit = defineEmits<RowListEmits>();

interface MobileColumnLayout<T> {
  primaryCol: DataTableColumn<T>;
  mainStatCol?: DataTableColumn<T>;
  secondaryCols: DataTableColumn<T>[];
}

function resolveMobileColumns(columns: DataTableColumn<T>[]): MobileColumnLayout<T> | null {
  if (columns.length === 0) return null;
  const primaryCol = columns.find((col) => !col.hiddenMd) ?? (columns[0] as DataTableColumn<T>);
  const others = columns.filter((col) => col !== primaryCol);
  const mainStatCol = others.find((col) => col.mobilePrimary) ?? others.find((col) => !col.hiddenMd);
  const secondaryCols = others.filter((col) => !col.hiddenMd && col !== mainStatCol);
  return { primaryCol, mainStatCol, secondaryCols };
}

const layout = computed(() => resolveMobileColumns(props.columns));

const { renderExpanded, rowName, isRowExpanded } = useRowList(props);
</script>

<template>
  <div v-if="layout" class="flex flex-col gap-3">
    <template v-for="row in pagedData" :key="getRowId(row)">
      <div
        :class="
          cn(
            'border border-border bg-bg-card p-4 overflow-hidden transition-colors duration-fast',
            'hoverable:hover:border-text-tertiary/40',
            isRowExpanded(row) && 'border-text-tertiary/40',
          )
        "
      >
        <div class="flex items-center gap-2 min-w-0">
          <ExpandToggle
            v-if="isExpandable"
            :row-id="getRowId(row)"
            :row-name="rowName(row)"
            :is-expanded="isRowExpanded(row)"
            :size="16"
            @toggle-expand="emit('toggleExpand', $event)"
          />
          <div class="min-w-0 flex-1">
            <CellView :render="layout.primaryCol.cell" :row="row" />
          </div>
          <div v-if="layout.mainStatCol" class="shrink-0 text-right min-w-0 max-w-[40%]">
            <span v-if="layout.mainStatCol.header" class="ui-meta mr-1.5 truncate">{{
              layout.mainStatCol.header
            }}</span>
            <div class="ui-mono-value font-semibold">
              <CellView :render="layout.mainStatCol.cell" :row="row" />
            </div>
          </div>
        </div>
        <div
          v-if="layout.secondaryCols.length > 0"
          class="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 border-t border-border/60 pt-3"
        >
          <div
            v-for="col in layout.secondaryCols"
            :key="col.id"
            :class="cn('flex items-baseline gap-1.5 min-w-0', col.align === 'right' && 'ml-auto')"
          >
            <span v-if="col.header" class="ui-meta shrink-0">{{ col.header }}</span>
            <div class="ui-body min-w-0">
              <CellView :render="col.cell" :row="row" />
            </div>
          </div>
        </div>
      </div>
      <ExpandedRowPanel
        v-if="isRowExpanded(row) && isExpandable"
        :row-id="getRowId(row)"
        :row-name="rowName(row)"
        class="border border-t-0 border-border bg-bg-secondary/60 overflow-hidden"
      >
        <CellView :render="renderExpanded" :row="row" />
      </ExpandedRowPanel>
    </template>
  </div>
</template>
