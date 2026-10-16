<script setup lang="ts">
import { computed, useSlots } from "vue";
import { cn } from "@/client/utils/cn";

const props = withDefaults(defineProps<{ title: string; description?: string; compact?: boolean; class?: string }>(), {
  compact: false,
});

const slots = useSlots();

const classes = computed(() => cn("flex flex-col sm:flex-row sm:items-end justify-between gap-4", props.class));
</script>

<template>
  <header :class="classes">
    <div class="min-w-0">
      <h1 :class="compact ? 'text-xl sm:text-2xl font-semibold tracking-title' : 'ui-page-title'">{{ title }}</h1>
      <p v-if="description" class="ui-body-secondary mt-3 max-w-2xl text-balance">{{ description }}</p>
    </div>
    <div v-if="slots.actions" class="flex w-full sm:w-auto min-w-0 max-w-full items-center gap-2 sm:shrink-0">
      <slot name="actions" />
    </div>
  </header>
</template>
