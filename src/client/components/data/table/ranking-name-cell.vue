<script setup lang="ts">
defineProps<{ name: string; title?: string }>();
</script>

<template>
  <div class="flex items-center min-w-0 gap-2">
    <p class="truncate flex-1 min-w-0 ui-body font-medium" :title="title ?? name">{{ name || "—" }}</p>
    <slot name="suffix" />
  </div>
</template>
