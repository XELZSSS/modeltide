<script setup lang="ts">
import { computed, useSlots } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ title?: string; subtitle?: string; class?: string }>();
const slots = useSlots();
const hasSubtitle = computed(() => slots.subtitle != null || (props.subtitle != null && props.subtitle !== ""));
const wrapperClass = computed(() => cn("ui-card-title border-b border-border pb-3", props.class));
</script>

<template>
  <p v-if="!hasSubtitle" :class="cn(wrapperClass, 'mb-4')">
    <slot name="title">{{ title }}</slot>
  </p>
  <div v-else :class="cn('min-w-0 border-b border-border pb-3 mb-4', props.class)">
    <p class="ui-card-title mb-1">
      <slot name="title">{{ title }}</slot>
    </p>
    <p class="ui-caption">
      <slot name="subtitle">{{ subtitle }}</slot>
    </p>
  </div>
</template>
