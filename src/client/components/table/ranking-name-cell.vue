<script setup lang="ts">
import { FALLBACK_DASH } from "@/shared/config/ui";

defineProps<{ name: string; title?: string }>();
</script>

<template>
  <div class="flex items-center min-w-0 gap-2">
    <p class="flex-1 min-w-0 ui-body font-medium break-words md:truncate" :title="title ?? name">
      {{ name || FALLBACK_DASH }}
    </p>
    <slot name="suffix" />
  </div>
</template>
