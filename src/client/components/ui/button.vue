<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "@/client/components/ui/button-variants";

/**
 * The app's only button. Shape, colour and sizing for every usage are declared once in button-variants.ts; this
 * component just resolves the variant for the current props and passes the caller's extra classes through `cn`, so a
 * one-off adjustment (`w-full`, `-mt-2`) never has to fight the base styles.
 */
const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    class?: string;
  }>(),
  { variant: "ghost", size: "sm", disabled: false },
);

const classes = computed(() => cn(buttonVariants({ variant: props.variant, size: props.size }), props.class));
</script>

<template>
  <button type="button" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
