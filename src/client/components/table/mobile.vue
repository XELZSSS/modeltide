<script setup lang="ts" generic="T extends object">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import type { DataTableColumn, RowListProps } from "./table-columns.ts";
import { CellView, type RowListEmits } from "./cell-view";
import ExpandToggle from "./expand-toggle.vue";
import { ExpandedRowPanel } from "./expanded-row-panel.ts";
import { useRowList } from "./use-row-list";
import { staggerStyle } from "@/client/motion";

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

const { rows, renderExpanded } = useRowList(props);
</script>

<template>
  <div v-if="layout" class="flex flex-col gap-3">
    <template v-for="(item, index) in rows" :key="item.id">
      <div
        :class="
          cn(
            'ui-card p-4 overflow-hidden ui-motion',
            props.stagger !== false && 'ui-anim-rows',
            props.stagger === false && 'ui-anim-swap',
            'hoverable:hover:border-text-tertiary/40',
            item.expanded && 'border-text-tertiary/40',
          )
        "
        :style="staggerStyle(index)"
      >
        <div class="flex items-start gap-2 min-w-0">
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
            <div class="flex items-start gap-2 min-w-0">
              <div class="min-w-0 flex-1">
                <CellView :render="layout.primaryCol.cell" :row="item.row" />
              </div>
              <!-- Stacked, not inline: "Hallucination Rate" and "Avg Intelligence" do not fit beside the value in a
                   40%-wide column, and truncating the header left the number unlabelled on touch, where `title` never
                   fires. -->
              <div v-if="layout.mainStatCol" class="flex shrink-0 flex-col items-end gap-0.5 max-w-[45%]">
                <span v-if="layout.mainStatCol.header" class="ui-meta text-right leading-tight">
                  {{ layout.mainStatCol.header }}
                </span>
                <div class="ui-mono-value font-semibold">
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
              <div v-for="col in layout.secondaryCols" :key="col.id" class="flex flex-col gap-0.5 min-w-0">
                <span v-if="col.header" class="ui-meta">{{ col.header }}</span>
                <div class="ui-body min-w-0 break-words">
                  <CellView :render="col.cell" :row="item.row" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Transition name="ui-rise">
        <ExpandedRowPanel
          v-if="item.expanded && isExpandable"
          :row-id="item.id"
          :row-name="item.name"
          class="border border-t-0 border-border bg-bg-secondary/60 overflow-hidden"
        >
          <CellView :render="renderExpanded" :row="item.row" />
        </ExpandedRowPanel>
      </Transition>
    </template>
  </div>
</template>
