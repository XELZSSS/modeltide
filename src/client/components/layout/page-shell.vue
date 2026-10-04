<script setup lang="ts">
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import { PAGE_BLOCK_GAP } from "@/client/config/layout";

withDefaults(defineProps<{ title: string; description?: string; compact?: boolean }>(), { compact: false });
</script>

<template>
  <PageContainer>
    <div :class="PAGE_BLOCK_GAP">
      <PageHeader :compact="compact" :title="title" :description="description">
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      </PageHeader>
      <slot />
    </div>
  </PageContainer>
</template>
