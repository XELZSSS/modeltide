<script lang="ts">
import { h, type FunctionalComponent } from "vue";
import { cn } from "@/client/utils/cn";
import type { DataTableColumn } from "./table-columns.vue";

function cellClasses<T>(col: DataTableColumn<T>): string {
  return cn("px-4 py-3.5", col.hiddenMd && "hidden md:table-cell");
}

function cellInnerClasses<T>(col: DataTableColumn<T>): string {
  return cn("flex items-center gap-2 min-w-0 [&>*]:min-w-0", col.align === "right" && "justify-end text-right");
}

export const TableHeader: FunctionalComponent<{ columns: DataTableColumn<any>[]; isExpandable: boolean }> = (props) =>
  h(
    "thead",
    h(
      "tr",
      { class: "border-b border-border" },
      props.columns.map((col, colIdx) =>
        h(
          "th",
          {
            key: col.id,
            scope: "col",
            class: cn(cellClasses(col), "ui-table-header"),
            style: { width: col.width },
          },
          h("div", { class: cellInnerClasses(col) }, [
            props.isExpandable && colIdx === 0 ? h("span", { class: "w-3.5 shrink-0", "aria-hidden": "true" }) : null,
            h("span", { class: "truncate uppercase tracking-caps" }, col.header),
          ]),
        ),
      ),
    ),
  );
</script>

<script setup lang="ts" generic="T">
import { type VNodeChild } from "vue";
import type { RowListProps } from "./table-columns.vue";
import ExpandToggle, { ExpandedRowPanel } from "./row-expand.vue";

const props = defineProps<RowListProps<T>>();

const emit = defineEmits<{ toggleExpand: [rowId: string | null] }>();

const CellView = (cellProps: { render: (row: T) => VNodeChild; row: T }): VNodeChild =>
  cellProps.render(cellProps.row);

const renderExpanded = (row: T): VNodeChild => props.renderExpandedRow?.(row);
const rowName = (row: T): string => props.getRowName?.(row) ?? props.getRowId(row);
const isRowExpanded = (row: T): boolean => props.expandedRowId === props.getRowId(row);
</script>

<template>
  <tbody>
    <template v-for="row in pagedData" :key="getRowId(row)">
      <tr
        :class="
          cn(
            'border-b border-border last:border-b-0 transition-colors duration-fast bg-bg-card',
            'hoverable:hover:bg-hover',
            isRowExpanded(row) && 'bg-bg-secondary/60',
          )
        "
      >
        <td v-for="(col, colIdx) in columns" :key="col.id" :class="cellClasses(col)" :style="{ width: col.width }">
          <div :class="cellInnerClasses(col)">
            <ExpandToggle
              v-if="isExpandable && colIdx === 0"
              :row-id="getRowId(row)"
              :row-name="rowName(row)"
              :is-expanded="isRowExpanded(row)"
              @toggle-expand="emit('toggleExpand', $event)"
            />
            <CellView :render="col.cell" :row="row" />
          </div>
        </td>
      </tr>
      <tr v-if="isRowExpanded(row) && isExpandable" class="border-b border-border last:border-b-0 bg-bg-secondary/60">
        <td :colspan="columns.length">
          <ExpandedRowPanel :row-id="getRowId(row)" :row-name="rowName(row)">
            <CellView :render="renderExpanded" :row="row" />
          </ExpandedRowPanel>
        </td>
      </tr>
    </template>
  </tbody>
</template>
