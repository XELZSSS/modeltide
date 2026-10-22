<script setup lang="ts">
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";

defineProps<{ label: string; class?: string }>();
</script>

<template>
  <Card>
    <CardContent compact class="flex flex-col items-center justify-center gap-1.5 text-center">
      <div class="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
        <p class="ui-meta font-medium truncate">{{ label }}</p>
      </div>
      <div class="ui-metric"><slot /></div>
    </CardContent>
  </Card>
</template>
