<script setup lang="ts">
/** Two columns of info rows, from a single column on a phone. */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";

const classes = computed(() => cn("grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2"));
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
