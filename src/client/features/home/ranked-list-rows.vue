<script setup lang="ts">
export interface RankedRow {
  label: string;
  valueLabel: string;
  color?: string;
}

defineProps<{ rows: RankedRow[] }>();
</script>

<template>
  <div class="flex flex-1 flex-col gap-1 justify-between">
    <div v-for="(row, i) in rows" :key="`${row.label}#${i + 1}`" class="flex h-9 items-center gap-3 min-w-0">
      <span class="text-xs font-medium text-text-tertiary w-6 text-center shrink-0 tabular-nums">
        {{ i + 1 }}
      </span>
      <slot name="label" :row="row" :index="i">
        <span class="text-sm truncate min-w-0 flex-1" :title="row.label">{{ row.label }}</span>
      </slot>
      <slot name="value" :row="row" :index="i">
        <span class="ui-mono-value shrink-0">{{ row.valueLabel }}</span>
      </slot>
    </div>
  </div>
</template>
