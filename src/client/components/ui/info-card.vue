<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";

const props = defineProps<{ title: string; class?: string }>();
const classes = computed(() => cn("flex flex-col gap-2 min-w-0", props.class));
</script>

<template>
  <Card>
    <CardContent>
      <p class="ui-card-title mb-4">{{ title }}</p>
      <div :class="classes"><slot /></div>
    </CardContent>
  </Card>
</template>
