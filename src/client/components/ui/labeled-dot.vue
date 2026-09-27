<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import Dot from "@/client/components/ui/dot.vue";

const props = withDefaults(
  defineProps<{ color?: string; size?: "sm" | "md"; class?: string; textClass?: string }>(),
  { size: "sm" },
);

const classes = computed(() => cn("flex items-center gap-2 min-w-0", props.class));
const textClasses = computed(() => cn("text-sm font-medium truncate min-w-0", props.textClass));
</script>

<template>
  <span :class="classes">
    <Dot :size="size" :color="color" />
    <span :class="textClasses"><slot /></span>
  </span>
</template>
