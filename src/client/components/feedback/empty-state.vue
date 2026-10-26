<script setup lang="ts">
/**
 * The shared "nothing to show" state, in three roles: `empty` (a card, nothing matched), `error` (a card, announced as
 * an alert) and `plain` (no card chrome, for a tab body that already sits inside one). The wrapper element and the
 * `role` both follow the variant, so the markup is correct without the caller passing either.
 */
import { computed, type Component } from "vue";
import { cn } from "@/client/utils/cn";
import Card from "@/client/components/layout/card.vue";

const props = withDefaults(
  defineProps<{
    icon?: Component;
    message: string;
    title?: string;
    /** Localized technical lines shown under the message: which source failed, which statuses came back. */
    details?: string[];
    variant?: "empty" | "error" | "plain";
    compact?: boolean;
    class?: string;
  }>(),
  { variant: "empty", compact: false, details: () => [] },
);

const classes = computed(() =>
  props.variant === "plain"
    ? cn("flex ui-anim-fade flex-col items-center justify-center gap-2 text-center", props.class)
    : cn(
        props.compact
          ? "flex ui-anim-fade flex-col items-center justify-center gap-2 p-6 text-center"
          : "flex min-h-[200px] ui-anim-fade flex-col items-center justify-center gap-3 p-8 text-center sm:min-h-[240px] sm:p-10",
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
      class="text-text-tertiary opacity-50"
      aria-hidden="true"
    />
    <p v-if="title" class="text-center ui-card-title text-text-primary">{{ title }}</p>
    <p class="max-w-md text-center ui-body-secondary text-balance">{{ message }}</p>
    <ul v-if="props.details.length > 0" class="max-w-md space-y-0.5 text-center ui-meta">
      <li v-for="line in props.details" :key="line" class="font-mono break-words">{{ line }}</li>
    </ul>
  </component>
</template>
