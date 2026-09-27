<script setup lang="ts">
import type { Component } from "vue";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";

defineProps<{ label: string; icon?: Component; class?: string }>();
</script>

<template>
  <Card>
    <CardContent class="flex flex-col items-center justify-center gap-1.5 py-4 text-center sm:p-4">
      <div class="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
        <span v-if="icon" class="text-accent shrink-0" aria-hidden="true">
          <component :is="icon" class="size-4" />
        </span>
        <p class="ui-meta font-medium truncate">{{ label }}</p>
      </div>
      <div class="ui-mono-value text-2xl font-semibold tracking-title wrap-anywhere min-w-0"><slot /></div>
    </CardContent>
  </Card>
</template>
