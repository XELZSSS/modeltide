<script setup lang="ts">
/** A dot plus its label: the legend entry used wherever a colour has to be explained. */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import Dot from "@/client/components/ui/dot.vue";

const props = defineProps<{ color?: string; class?: string; title?: string }>();

const classes = computed(() => cn("flex min-w-0 items-center gap-2", props.class));
</script>

<template>
  <span :class="classes">
    <Dot size="sm" :color="color" />
    <span class="min-w-0 truncate ui-body font-medium" v-tooltip="title ?? undefined"><slot /></span>
  </span>
</template>
