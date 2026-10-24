<script setup lang="ts">
/**
 * A card's title row: one `font-semibold` 14px line over the body, with an optional muted subtitle beneath it. No rule
 * separates it from the content — the reference cards rely on spacing, and a full-width line at every card header was
 * the heaviest thing in the old surface.
 */
import { computed, useSlots } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ title?: string; subtitle?: string; class?: string }>();
const slots = useSlots();
const hasSubtitle = computed(() => slots.subtitle != null || (props.subtitle != null && props.subtitle !== ""));
const wrapperClass = computed(() => cn("ui-card-title", props.class));
</script>

<template>
  <p v-if="!hasSubtitle" :class="cn(wrapperClass, 'mb-3')">
    <slot name="title">{{ title }}</slot>
  </p>
  <div v-else :class="cn('mb-3 min-w-0', wrapperClass)">
    <p class="mb-0.5 ui-card-title">
      <slot name="title">{{ title }}</slot>
    </p>
    <p class="ui-caption">
      <slot name="subtitle">{{ subtitle }}</slot>
    </p>
  </div>
</template>
