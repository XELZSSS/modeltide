<script setup lang="ts">
import { computed, type Component } from "vue";
import { cn } from "@/client/utils/cn";
import Card from "@/client/components/ui/card.vue";

const props = withDefaults(
  defineProps<{
    icon?: Component;
    message: string;
    title?: string;
    variant?: "empty" | "error" | "plain";
    compact?: boolean;
    class?: string;
  }>(),
  { variant: "empty", compact: false },
);

const classes = computed(() =>
  props.variant === "plain"
    ? cn("flex flex-col items-center justify-center gap-2 text-center", props.class)
    : cn(
        props.compact
          ? "flex flex-col items-center justify-center gap-2 p-6 text-center"
          : "flex flex-col items-center justify-center gap-3 p-10 text-center min-h-[240px]",
        props.class,
      ),
);
</script>

<template>
  <component :is="variant === 'plain' ? 'div' : Card" :class="classes" :role="variant === 'error' ? 'alert' : 'status'">
    <component
      :is="icon"
      v-if="icon"
      :size="compact ? 24 : 32"
      class="opacity-50 text-text-tertiary"
      aria-hidden="true"
    />
    <p v-if="title" class="ui-card-title text-center text-text-primary">{{ title }}</p>
    <p class="ui-body-secondary text-center text-balance max-w-md">{{ message }}</p>
  </component>
</template>
