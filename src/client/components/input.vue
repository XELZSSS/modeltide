<script setup lang="ts">
import { computed, ref } from "vue";
import { cn } from "@/client/utils/cn";

const model = defineModel<string>();

const props = defineProps<{ class?: string; ariaInvalid?: boolean }>();

const el = ref<HTMLInputElement | null>(null);

defineExpose({ el });

const invalid = computed(() => props.ariaInvalid === true);

const classes = computed(() =>
  cn(
    "h-9 px-3 min-w-0 max-w-full text-base sm:text-sm border border-border bg-bg-primary text-text-primary placeholder:text-text-tertiary outline-none transition-colors duration-fast hoverable:hover:border-text-tertiary/40 focus:border-accent/60 focus:ring-2 focus:ring-ring/30 disabled:opacity-50 disabled:bg-bg-secondary",
    invalid.value && "border-destructive focus:border-destructive focus:ring-destructive/30",
    props.class,
  ),
);
</script>

<template>
  <input ref="el" v-model="model" :aria-invalid="invalid || undefined" :class="classes" />
</template>
