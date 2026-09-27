<script lang="ts">
import { h, type FunctionalComponent, type VNodeChild } from "vue";
import { cn } from "@/client/utils/cn";

export interface DataTableColumn<T> {
  id: string;
  header?: string;
  cell: (row: T) => VNodeChild;
  align?: "left" | "right";
  width?: number | string;
  hiddenMd?: boolean;
  mobilePrimary?: boolean;
}

export interface RowListProps<T> {
  pagedData: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  getRowName?: (row: T) => string;
  isExpandable: boolean;
  expandedRowId?: string | null;
  renderExpandedRow?: (row: T) => VNodeChild;
}

interface ColOpts {
  width?: number | string;
  hiddenMd?: boolean;
  mobilePrimary?: boolean;
  align?: "left" | "right";
}

export function col<T>(id: string, header: string, cell: (row: T) => VNodeChild, opts?: ColOpts): DataTableColumn<T> {
  return { id, header, cell, ...opts };
}

export function trendClass(change: number | null | undefined, zeroAsSuccess = false): string {
  if (change == null || change === 0) return zeroAsSuccess ? "text-success" : "text-text-tertiary";
  return change > 0 ? "text-success" : "text-destructive";
}

export function rightCol<T>(
  id: string,
  header: string,
  cell: (row: T) => VNodeChild,
  opts?: { hiddenMd?: boolean; width?: number | string },
): DataTableColumn<T> {
  return col(id, header, cell, { ...opts, align: "right" });
}

export function mobilePrimaryCol<T>(
  id: string,
  header: string,
  cell: (row: T) => VNodeChild,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return col(id, header, cell, { ...opts, align: "right", mobilePrimary: true });
}

const MONO_EMPHASIS_CLASS = {
  strong: "ui-mono-value font-semibold",
  muted: "ui-mono-value font-normal text-text-secondary",
} as const;

export function monoCol<T>(
  id: string,
  header: string,
  format: (row: T) => VNodeChild,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean; emphasis?: keyof typeof MONO_EMPHASIS_CLASS },
): DataTableColumn<T> {
  const className = opts?.emphasis ? MONO_EMPHASIS_CLASS[opts.emphasis] : "ui-mono-value";
  const cell = (row: T): VNodeChild => h("span", { class: className }, [format(row)]);
  const alignOpts = opts?.hiddenMd ? { hiddenMd: true } : undefined;
  return opts?.mobilePrimary ? mobilePrimaryCol(id, header, cell, alignOpts) : rightCol(id, header, cell, alignOpts);
}

export const RightAlignedText: FunctionalComponent<{ class?: string }> = (props, { slots }) =>
  h("p", { class: cn("overflow-hidden text-ellipsis whitespace-nowrap text-right", props.class) }, slots.default?.());
</script>

<script setup lang="ts">
defineProps<{ name: string; title?: string }>();
</script>

<template>
  <div class="flex items-center min-w-0 gap-2">
    <p class="truncate flex-1 min-w-0 ui-body font-medium" :title="title ?? name">{{ name || "—" }}</p>
    <slot name="suffix" />
  </div>
</template>
