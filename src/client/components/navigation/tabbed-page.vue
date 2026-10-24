<script setup lang="ts">
/**
 * The page skeleton for a view that is split into tabs: the page column, the heading with its actions slot, and the tab
 * strip around the body. Tab state stays with the caller, which is what lets a hub restore the tab from the URL.
 */
import PageContainer from "@/client/components/layout/page-container.vue";
import PageHeader from "@/client/components/layout/page-header.vue";
import TabContainer from "@/client/components/navigation/tab-container.vue";
import type { TabItem } from "@/client/components/navigation/tabs";
import { PAGE_BLOCK_GAP } from "@/client/nav/layout";

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
