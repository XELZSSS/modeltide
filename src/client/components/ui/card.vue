<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ class?: string }>();
const classes = computed(() => cn("ui-card", props.class));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
