<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import SegmentedGroup from "@/client/components/ui/segmented-group.vue";
import TabButton from "@/client/components/ui/tab-button.vue";
import { nextIndexForKey, type TabItem } from "@/client/components/ui/tabs";

const props = withDefaults(
  defineProps<{
    tabs: TabItem[];
    activeTab: string;
    class?: string;
    tabSize?: "sm" | "md";
    fill?: boolean;
    ariaLabel?: string;
  }>(),
  { tabSize: "sm", fill: false },
);

const emit = defineEmits<{ tabChange: [tabId: string]; tabIntent: [tabId: string, active: boolean] }>();

const groupClasses = computed(() =>
  cn("w-fit max-w-full overflow-x-auto no-scrollbar sm:flex-wrap", props.fill && "w-full sm:w-full"),
);
const panelClasses = computed(() => cn("min-w-0", props.class));

function onKeydown(event: KeyboardEvent): void {
  const nextIndex = nextIndexForKey(
    event.key,
    props.tabs.findIndex((tab) => tab.id === props.activeTab),
    props.tabs.length,
  );
  if (nextIndex == null) return;
  event.preventDefault();
  const next = props.tabs[nextIndex];
  if (!next) return;
  emit("tabChange", next.id);
  document.getElementById(`tab-${next.id}`)?.focus();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SegmentedGroup :class="groupClasses" role="tablist" :aria-label="ariaLabel" @keydown="onKeydown">
      <TabButton
        v-for="tab in tabs"
        :key="tab.id"
        :class="fill ? 'flex-1 sm:flex-auto sm:shrink sm:text-center' : undefined"
        :active="activeTab === tab.id"
        :size="tabSize"
        :tab-index="activeTab === tab.id ? 0 : -1"
        :aria-controls="activeTab === tab.id ? `panel-${tab.id}` : undefined"
        :id="`tab-${tab.id}`"
        @intent="emit('tabIntent', tab.id, $event)"
        @click="emit('tabChange', tab.id)"
      >
        {{ tab.label }}
      </TabButton>
    </SegmentedGroup>
    <div
      :key="activeTab"
      role="tabpanel"
      :id="`panel-${activeTab}`"
      :aria-labelledby="`tab-${activeTab}`"
      tabindex="0"
      :class="panelClasses"
    >
      <slot />
    </div>
  </div>
</template>
