<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";

// The app's only loading indicator: three dots on one shared timeline (see `ui-dots` in motion.css). Its single caller is
// the Suspense placeholder, so it never has to say *what* is loading — it is only ever shown where content will land.
const props = defineProps<{ label?: string; class?: string }>();

const { t } = useTranslation();

// The dots' geometry is a token (`--motion-dot-size` in motion.css) and this is the app's only loader, so there is no
// size to switch: the caller supplies colour and box padding and nothing else.
const dotsClass = computed(() => cn("ui-dots", props.class));
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
