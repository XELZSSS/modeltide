<script setup lang="ts">
/** A coloured dot: the colour is a caller-supplied value (a provider's brand colour), the size is from the scale. */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const DOT_SIZE_CLASS = { sm: "w-2 h-2", md: "w-2.5 h-2.5" } as const;

const props = withDefaults(defineProps<{ size?: keyof typeof DOT_SIZE_CLASS; color?: string; class?: string }>(), {
  size: "md",
});

const classes = computed(() => cn("inline-block shrink-0 rounded-full", DOT_SIZE_CLASS[props.size], props.class));
</script>

<template>
  <span :class="classes" :style="color ? { backgroundColor: color } : undefined" />
</template>
