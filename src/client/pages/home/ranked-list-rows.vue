<script setup lang="ts">
/**
 * The ranked rows a home card shows: a rank number, a label and a right-aligned figure.
 *
 * The rows arrive one after another (`ui-anim-rows`) the way the data tables do, and each row is a full 40px tall — the
 * height does the separating between rows, so no divider is drawn.
 */
import { staggerStyle } from "@/client/motion";

interface RankedRow {
  label: string;
  valueLabel: string;
  color?: string;
}

defineProps<{ rows: RankedRow[] }>();
</script>

<template>
  <div class="flex flex-1 flex-col justify-between">
    <div
      v-for="(row, i) in rows"
      :key="`${row.label}#${i + 1}`"
      class="flex min-h-10 min-w-0 ui-anim-rows items-center gap-3"
      :style="staggerStyle(i)"
    >
      <span class="w-6 shrink-0 text-center ui-meta font-medium tabular-nums">
        {{ i + 1 }}
      </span>
      <slot name="label" :row="row" :index="i">
        <span class="min-w-0 flex-1 truncate text-sm" v-tooltip="row.label">{{ row.label }}</span>
      </slot>
      <slot name="value" :row="row" :index="i">
        <span class="shrink-0 ui-mono-value">{{ row.valueLabel }}</span>
      </slot>
    </div>
  </div>
</template>
