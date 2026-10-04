<script setup lang="ts">
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import TabContainer from "@/client/components/ui/tab-container.vue";
import type { TabItem } from "@/client/components/ui/tabs";
import { PAGE_BLOCK_GAP } from "@/client/config/layout";

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    compact?: boolean;
    tabs: TabItem[];
    activeTab: string;
    tabSize?: "sm" | "md";
    tabFill?: boolean;
  }>(),
  { tabSize: "sm", tabFill: false },
);

const emit = defineEmits<{ tabChange: [tabId: string]; tabIntent: [tabId: string, active: boolean] }>();

function forwardTabIntent(tabId: string, active: boolean): void {
  emit("tabIntent", tabId, active);
}
</script>

<template>
  <PageContainer>
    <div :class="PAGE_BLOCK_GAP">
      <PageHeader :compact="compact" :title="title" :description="description">
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      </PageHeader>
      <TabContainer
        :tabs="tabs"
        :active-tab="activeTab"
        :tab-size="tabSize"
        :fill="tabFill"
        :aria-label="title"
        @tab-intent="forwardTabIntent"
        @tab-change="emit('tabChange', $event)"
      >
        <slot />
      </TabContainer>
    </div>
  </PageContainer>
</template>
