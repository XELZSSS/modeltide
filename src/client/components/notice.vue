<script setup lang="ts">
import { TriangleAlert } from "@lucide/vue";
</script>

<template>
  <div
    role="status"
    class="mb-3 flex items-center gap-1.5 border border-warning/30 bg-warning-light px-3 py-2 ui-caption text-text-secondary"
  >
    <TriangleAlert :size="14" class="shrink-0 text-warning" aria-hidden="true" />
    <span class="min-w-0"><slot /></span>
  </div>
</template>
