<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";

// The single loading indicator of the app: three dots on one shared timeline (see `ui-dots` in motion.css). It is a
// dumb visual — *what* is loading is decided by the caller, which in this app is always the live fetch count.
const props = withDefaults(defineProps<{ label?: string; size?: "sm" | "md"; class?: string }>(), {
  size: "md",
});

const { t } = useTranslation();

const DOT_SIZE = {
  sm: "[--motion-dot-size:0.25rem]",
  md: "[--motion-dot-size:0.375rem]",
} as const;

const dotsClass = computed(() => cn("ui-dots", DOT_SIZE[props.size], props.class));
const label = computed(() => props.label ?? t("loading"));
</script>

<template>
  <span role="status" aria-live="polite" class="inline-flex items-center">
    <span :class="dotsClass" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
