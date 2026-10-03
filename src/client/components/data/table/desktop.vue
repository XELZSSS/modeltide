<script lang="ts">
import { h, type FunctionalComponent } from "vue";
import { cn } from "@/client/utils/cn";
import type { DataTableColumn } from "./table-columns.ts";

type HeaderColumn = Pick<DataTableColumn<never>, "id" | "header" | "width" | "hiddenMd" | "align">;

function cellClasses(col: HeaderColumn): string {
  return cn("px-4 py-3.5", col.hiddenMd && "hidden md:table-cell");
}

function cellInnerClasses(col: HeaderColumn): string {
  return cn("flex items-center gap-2 min-w-0 [&>*]:min-w-0", col.align === "right" && "justify-end text-right");
}

export const TableHeader: FunctionalComponent<{ columns: HeaderColumn[]; isExpandable: boolean }> = (props) =>
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
            col.header ? h("span", { class: "truncate uppercase tracking-caps" }, col.header) : null,
          ]),
        ),
      ),
    ),
  );
</script>

<script setup lang="ts" generic="T extends object">
import { computed, type VNodeChild } from "vue";
import type { RowListProps } from "./table-columns.ts";
import { CellView, type RowListEmits } from "./cell-view";
import ExpandToggle from "./expand-toggle.vue";
import { ExpandedRowPanel } from "./expanded-row-panel.ts";

const props = defineProps<RowListProps<T>>();

const emit = defineEmits<RowListEmits>();

// Derive ids, names and expansion once per row instead of calling the
// accessors three to five times per row inside the template.
const rows = computed(() =>
  props.pagedData.map((row) => {
    const id = props.getRowId(row);
    return {
      row,
      id,
      name: props.getRowName?.(row) ?? id,
      expanded: props.expandedRowId === id,
    };
  }),
);

const renderExpanded = (row: T): VNodeChild => props.renderExpandedRow?.(row);
</script>

<template>
  <tbody>
    <template v-for="item in rows" :key="item.id">
      <tr
        :class="
          cn(
            'border-b border-border last:border-b-0 transition-colors duration-fast bg-bg-card',
            'hoverable:hover:bg-hover',
            item.expanded && 'bg-bg-secondary/60',
          )
        "
      >
        <td v-for="(col, colIdx) in columns" :key="col.id" :class="cellClasses(col)" :style="{ width: col.width }">
          <div :class="cellInnerClasses(col)">
            <ExpandToggle
              v-if="isExpandable && colIdx === 0"
              :row-id="item.id"
              :row-name="item.name"
              :is-expanded="item.expanded"
              @toggle-expand="emit('toggleExpand', $event)"
            />
            <CellView :render="col.cell" :row="item.row" />
          </div>
        </td>
      </tr>
      <tr v-if="item.expanded && isExpandable" class="border-b border-border last:border-b-0 bg-bg-secondary/60">
        <td :colspan="columns.length">
          <ExpandedRowPanel :row-id="item.id" :row-name="item.name">
            <CellView :render="renderExpanded" :row="item.row" />
          </ExpandedRowPanel>
        </td>
      </tr>
    </template>
  </tbody>
</template>
