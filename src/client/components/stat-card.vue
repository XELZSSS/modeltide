<script setup lang="ts">
import Card from "./card.vue";
import CardContent from "./card-content.vue";

defineProps<{ label: string; class?: string }>();
</script>

<template>
  <Card>
    <CardContent compact class="flex flex-col items-center justify-center gap-1.5 text-center">
      <div class="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
        <p class="ui-meta font-medium truncate">{{ label }}</p>
      </div>
      <div class="ui-mono-value text-2xl font-semibold tracking-title wrap-anywhere min-w-0"><slot /></div>
    </CardContent>
  </Card>
</template>
