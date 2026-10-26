<script setup lang="ts" generic="T extends object">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import type { DataTableColumn, RowListEmits, RowListProps } from "./table-columns.ts";
import { CellView } from "./cell-view";
import ExpandToggle from "./expand-toggle.vue";
import { ExpandedRowPanel } from "./expanded-row-panel.ts";
import { useRowList } from "./use-row-list";

/**
 * The mobile table body: one card per row.
 *
 * A column list designed for a wide table becomes a readable card, so the roles are resolved once per column set
 * instead of per row: a primary cell, an optional headline stat beside it, and the remaining columns as a two-column
 * label/value grid. `hiddenMd` columns are skipped here too — they exist only because the primary cell already carries
 * that value on a phone.
 */
const props = defineProps<RowListProps<T>>();

const emit = defineEmits<RowListEmits>();

interface MobileColumnLayout<T> {
  primaryCol: DataTableColumn<T>;
  mainStatCol?: DataTableColumn<T>;
  secondaryCols: DataTableColumn<T>[];
}

const layout = computed(() => resolveMobileColumns(props.columns));

const { rows, renderExpanded } = useRowList(props);

// Static per row, so the merge runs once at setup rather than once per card on every render.
const CARD_CLASS = cn("ui-card overflow-hidden", "ui-anim-swap", "hoverable:hover:border-text-tertiary/40");
const CARD_CLASS_EXPANDED = cn(
  "ui-card overflow-hidden",
  "ui-anim-swap",
  "hoverable:hover:border-text-tertiary/40",
  "border-text-tertiary/40",
);

/**
 * The card layout for a phone: the primary column becomes the title, the `mobilePrimary` column the right-hand figure,
 * and the rest a two-column label/value grid. `hiddenMd` columns are dropped — they exist so a value already shown in
 * the primary column is not repeated on a wide screen.
 *
 * `null` means this table cannot be a card: an empty definition, or one whose columns are all `hiddenMd`. Both are
 * table-definition mistakes, but answering `null` renders nothing instead of picking a column that would print a blank
 * card, so the failure shows up in the view rather than in a non-null assertion.
 */
function resolveMobileColumns(columns: DataTableColumn<T>[]): MobileColumnLayout<T> | null {
  const primaryCol = columns.find((col) => !col.hiddenMd);
  if (!primaryCol) return null;
  const others = columns.filter((col) => col !== primaryCol);
  const mainStatCol = others.find((col) => col.mobilePrimary) ?? others.find((col) => !col.hiddenMd);
  const secondaryCols = others.filter((col) => !col.hiddenMd && col !== mainStatCol);
  return { primaryCol, mainStatCol, secondaryCols };
}
</script>

<template>
  <div v-if="layout" class="flex flex-col gap-3">
    <template v-for="item in rows" :key="item.id">
      <!--
        The row and its detail panel are one surface, exactly like the desktop table keeps its expanded <tr> inside the
        table's card. The panel used to be a square-cornered sibling placed *below* a rounded card with a gap between
        them, so opening a row read as a second, unrelated block appearing underneath; `overflow-hidden` now clips both
        halves to the card's radius and the panel is separated by a divider instead of an edge.
      -->
      <div :class="item.expanded ? CARD_CLASS_EXPANDED : CARD_CLASS">
        <div class="flex min-w-0 items-start gap-2 p-4">
          <ExpandToggle
            v-if="isExpandable"
            :row-id="item.id"
            :row-name="item.name"
            :is-expanded="item.expanded"
            :size="16"
            @toggle-expand="emit('toggleExpand', $event)"
          />
          <!-- One content column for the whole card: the metric grid below used to start at the card edge while the name
               started after the expand chevron, so nothing above and below lined up. -->
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div class="flex min-w-0 items-start gap-2">
              <div class="min-w-0 flex-1">
                <CellView :render="layout.primaryCol.cell" :row="item.row" />
              </div>
              <!-- Stacked, not inline: "Hallucination Rate" and "Avg Intelligence" do not fit beside the value in a
                   40%-wide column, and truncating the header left the number unlabelled on touch, where `title` never
                   fires. -->
              <div v-if="layout.mainStatCol" class="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5">
                <span v-if="layout.mainStatCol.header" class="text-right ui-meta leading-tight">
                  {{ layout.mainStatCol.header }}
                </span>
                <!-- The value wraps instead of being clipped: the column is capped at 45%, and the card clips its own
                     overflow, so an over-long reading used to lose its tail with no ellipsis and no way to read it. -->
                <div class="min-w-0 text-right ui-mono-value font-semibold [overflow-wrap:anywhere]">
                  <CellView :render="layout.mainStatCol.cell" :row="item.row" />
                </div>
              </div>
            </div>
            <!-- Two fixed columns keep the labels aligned down the card list; the label sits above the value so neither
                 has to be clipped when a license name or a provider does not fit. -->
            <div
              v-if="layout.secondaryCols.length > 0"
              class="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3"
            >
              <div v-for="col in layout.secondaryCols" :key="col.id" class="flex min-w-0 flex-col gap-0.5">
                <span v-if="col.header" class="ui-meta">{{ col.header }}</span>
                <div class="min-w-0 ui-body break-words">
                  <CellView :render="col.cell" :row="item.row" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <ExpandedRowPanel
          v-if="item.expanded && isExpandable"
          :row-id="item.id"
          :row-name="item.name"
          class="border-t border-border bg-bg-secondary"
        >
          <CellView :render="renderExpanded" :row="item.row" />
        </ExpandedRowPanel>
      </div>
    </template>
  </div>
</template>
