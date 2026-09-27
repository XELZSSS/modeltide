<script setup lang="ts">
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import ChartSkeleton from "@/client/components/ui/chart-skeleton.vue";

defineProps<{
  title?: string;
  subtitle?: string;
  loading?: boolean;
  class?: string;
  contentClass?: string;
  skeletonHeight?: string;
}>();
</script>

<template>
  <Card :class="class">
    <CardContent :class="contentClass">
      <CardHeader v-if="title != null || $slots.title" :title="title" :subtitle="subtitle">
        <template v-if="$slots.title" #title><slot name="title" /></template>
        <template v-if="$slots.subtitle" #subtitle><slot name="subtitle" /></template>
      </CardHeader>
      <ChartSkeleton v-if="loading" :height="skeletonHeight" />
      <slot v-else />
    </CardContent>
  </Card>
</template>
