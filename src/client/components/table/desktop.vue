<script setup lang="ts" generic="T extends object">
import { cn } from "@/client/utils/cn";
import { CellView } from "./cell-view";
import { cellClasses, cellInnerClasses } from "./cell-classes.ts";
import ExpandToggle from "./expand-toggle.vue";
import { ExpandedRowPanel } from "./expanded-row-panel.ts";
import type { RowListEmits, RowListProps } from "./table-columns.ts";
import { useRowList } from "./use-row-list";

/**
 * The desktop table body: one `<tr>` per row plus its expander row. The header half lives in table-header.ts, and both
 * read their cell classes from cell-classes.ts so a hidden or right-aligned column behaves the same in the two.
 */
const props = defineProps<RowListProps<T>>();

const emit = defineEmits<RowListEmits>();

const { rows, renderExpanded } = useRowList(props);

// Static per row, so the merge runs once at setup rather than once per row on every render.
const ROW_CLASS = cn(
  "border-b border-border bg-bg-card last:border-b-0",
  "ui-anim-swap",
  "hoverable:hover:bg-surface-hover",
);
const ROW_CLASS_EXPANDED = cn(
  // The same bottom edge `ROW_CLASS` draws: it is the divider between the row and its detail panel, and without it the
  // opened row also lost that 1px of height against its collapsed neighbours.
  "border-b border-border bg-bg-secondary",
  "ui-anim-swap",
  "hoverable:hover:bg-surface-hover",
);
</script>

<template>
  <tbody>
    <template v-for="item in rows" :key="item.id">
      <tr :class="item.expanded ? ROW_CLASS_EXPANDED : ROW_CLASS">
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
      <tr v-if="item.expanded && isExpandable" class="border-b border-border bg-bg-secondary last:border-b-0">
        <td :colspan="columns.length">
          <ExpandedRowPanel :row-id="item.id" :row-name="item.name">
            <CellView :render="renderExpanded" :row="item.row" />
          </ExpandedRowPanel>
        </td>
      </tr>
    </template>
  </tbody>
</template>
