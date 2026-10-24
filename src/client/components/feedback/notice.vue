<script setup lang="ts">
/** A one-line warning strip: the shared look for every non-blocking message the app shows. */
import { TriangleAlert } from "@lucide/vue";
</script>

<template>
  <div
    role="status"
    class="mb-3 flex ui-anim-rise items-start gap-2 rounded-lg border border-warning/25 bg-warning-light px-3 py-2 ui-caption text-text-secondary"
  >
    <TriangleAlert :size="14" class="mt-px shrink-0 text-warning" aria-hidden="true" />
    <span class="min-w-0"><slot /></span>
  </div>
</template>
