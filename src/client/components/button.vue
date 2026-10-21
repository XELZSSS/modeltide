<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button-variants";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant | null;
    size?: ButtonSize | null;
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
