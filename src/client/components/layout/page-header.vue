<script setup lang="ts">
/**
 * The page heading: one `h1` at the display size (or the compact size inside a detail page), an optional description,
 * and a right-hand actions slot that stacks under the title on a phone.
 */
import { computed, useSlots } from "vue";
import { cn } from "@/client/utils/cn";

const props = withDefaults(defineProps<{ title: string; description?: string; compact?: boolean; class?: string }>(), {
  compact: false,
});

const slots = useSlots();

const classes = computed(() =>
  cn("flex ui-anim-rise flex-col justify-between gap-3 sm:flex-row sm:items-end sm:gap-4", props.class),
);
</script>

<template>
  <header :class="classes">
    <div class="min-w-0">
      <h1 :class="compact ? 'ui-page-title-compact' : 'ui-page-title'">{{ title }}</h1>
      <p v-if="description" class="mt-2.5 max-w-2xl ui-body-secondary text-balance">{{ description }}</p>
    </div>
    <div v-if="slots.actions" class="flex w-full max-w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
      <slot name="actions" />
    </div>
  </header>
</template>
