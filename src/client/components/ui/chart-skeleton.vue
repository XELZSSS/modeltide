<script setup lang="ts">
import ChartFrame from "@/client/components/ui/chart-frame.vue";

defineProps<{ height?: string }>();
</script>

<template>
  <ChartFrame :height="height">
    <div class="h-full w-full ui-skeleton" />
  </ChartFrame>
</template>
