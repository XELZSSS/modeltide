<script setup lang="ts" generic="T extends { label: string; valueLabel?: string; color?: string }">
/**
 * The ranked rows a home card shows: a rank number, a label and a right-aligned figure.
 *
 * The rows arrive one after another (`ui-anim-rows`) the way the data tables do, and each row is a full 40px tall — the
 * height does the separating between rows, so no divider is drawn.
 *
 * Generic over the row so a caller that prints more than the pair — the text-to-image card puts two figures under the
 * name — receives its own row in the slot instead of looking it up by index again.
 */
import { staggerStyle } from "@/client/motion";

defineProps<{ rows: T[] }>();
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
      <slot name="label" :row="row">
        <span class="min-w-0 flex-1 ui-body break-words md:truncate" v-tooltip="row.label">{{ row.label }}</span>
      </slot>
      <slot name="value" :row="row">
        <span class="shrink-0 ui-mono-value">{{ row.valueLabel }}</span>
      </slot>
    </div>
  </div>
</template>
