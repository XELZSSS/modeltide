<script setup lang="ts">
/**
 * A text input bound with `v-model`. It exposes its element so a caller can focus it, and takes `ariaInvalid` as a prop
 * rather than a fall-through attribute so the invalid styling and the attribute can never disagree.
 *
 * Shape is the reference design system's filled input: no visible border, a muted fill that darkens on hover/focus,
 * `rounded-xl`, and a 2px low-opacity ring instead of a coloured outline.
 */
import { computed, ref } from "vue";
import { cn } from "@/client/utils/cn";

const model = defineModel<string>({ required: true });

const props = defineProps<{ class?: string; ariaInvalid?: boolean }>();

const el = ref<HTMLInputElement | null>(null);

defineExpose({ el });

const invalid = computed(() => props.ariaInvalid === true);

const classes = computed(() =>
  cn(
    "h-9 max-w-full min-w-0 rounded-xl border border-transparent bg-muted/60 px-3 text-base text-text-primary ui-motion outline-none placeholder:text-text-tertiary sm:text-sm",
    "focus-visible:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring hoverable:hover:bg-muted/80",
    "disabled:bg-muted/40 disabled:opacity-50",
    invalid.value && "bg-destructive/5 ring-2 ring-destructive",
    props.class,
  ),
);
</script>

<template>
  <input ref="el" v-model="model" :aria-invalid="invalid || undefined" :class="classes" />
</template>
