<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/client/utils/cn";
import SegmentedGroup from "@/client/components/ui/segmented-group.vue";
import TabButton from "@/client/components/navigation/tab-button.vue";
import { useRovingRadio, type TabItem } from "@/client/components/navigation/tabs";

/**
 * The tab strip plus its panel. Arrow/Home/End handling comes from the shared roving-radio helper rather than a local
 * `keydown`: the strip is one tab stop that the arrow keys move inside, and the panel is labelled by the active tab.
 */
const props = withDefaults(
  defineProps<{
    tabs: TabItem[];
    activeTab: string;
    tabSize?: "sm" | "md";
    fill?: boolean;
    ariaLabel?: string;
  }>(),
  { tabSize: "sm", fill: false },
);

const emit = defineEmits<{ tabChange: [tabId: string]; tabIntent: [tabId: string, active: boolean] }>();

// Wrap rather than scroll: an edge fade over a strip that already fits faded the last tab's own label, and a hidden
// scroller with no affordance left tabs 4 and 5 invisible on a phone.
const groupClasses = computed(() => cn("w-fit max-w-full flex-wrap", props.fill && "w-full sm:w-full"));

const { onKeydown } = useRovingRadio({
  items: () => props.tabs.map((tab) => tab.id),
  activeId: () => props.activeTab,
  elementId: (tabId) => `tab-${tabId}`,
  select: (tabId) => emit("tabChange", tabId),
});
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
    <!-- `ui-anim-swap` is the vocabulary's "content that replaces other content in place" step: a fast cross-fade with no
         stagger and no travel. The panel is keyed per tab, so each switch mounts this fade — without it the old panel
         vanished and the new one appeared in the same frame. -->
    <div
      :key="activeTab"
      role="tabpanel"
      :id="`panel-${activeTab}`"
      :aria-labelledby="`tab-${activeTab}`"
      tabindex="0"
      class="flex min-w-0 ui-anim-swap flex-col gap-4"
    >
      <slot />
    </div>
  </div>
</template>
