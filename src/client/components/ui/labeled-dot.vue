<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import Dot from "@/client/components/ui/dot.vue";

const props = defineProps<{ color?: string; class?: string; title?: string }>();

const classes = computed(() => cn("flex items-center gap-2 min-w-0", props.class));
</script>

<template>
  <span :class="classes">
    <Dot size="sm" :color="color" />
    <span class="text-sm font-medium truncate min-w-0" :title="title ?? undefined"><slot /></span>
  </span>
</template>
