<script setup lang="ts">
/**
 * A titled card of label/value rows: the card chrome, the padding and the title spacing in one component, so detail
 * pages only describe content.
 */
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";

defineProps<{ title: string }>();
const classes = computed(() => cn("flex min-w-0 flex-col gap-2"));
</script>

<template>
  <Card>
    <CardContent>
      <p class="mb-4 ui-card-title">{{ title }}</p>
      <div :class="classes"><slot /></div>
    </CardContent>
  </Card>
</template>
