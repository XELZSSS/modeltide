<script lang="ts">
import { h, type FunctionalComponent } from "vue";
import { cn } from "@/client/utils/cn";

const panelId = (rowId: string): string => `${rowId}-panel`;

export const ExpandedRowPanel: FunctionalComponent<{ rowId: string; rowName: string; class?: string }> = (
  props,
  { slots },
) =>
  h(
    "div",
    {
      id: panelId(props.rowId),
      role: "region",
      "aria-label": props.rowName,
      class: cn("animate-enter px-4 py-3", props.class),
    },
    slots.default?.(),
  );
</script>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight } from "@lucide/vue";
import Button from "@/client/components/ui/button.vue";
import { useTranslation } from "@/client/i18n";
import type { RowListEmits } from "./row-list";

const props = withDefaults(defineProps<{ rowId: string; rowName: string; isExpanded: boolean; size?: number }>(), {
  size: 14,
});

const emit = defineEmits<RowListEmits>();

const { t } = useTranslation();

const label = computed(() => `${props.isExpanded ? t("collapseRow") : t("expandRow")} ${props.rowName}`);

function onToggle(event: MouseEvent): void {
  event.stopPropagation();
  emit("toggleExpand", props.isExpanded ? null : props.rowId);
}
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    class="shrink-0 size-7"
    :aria-expanded="isExpanded"
    :aria-label="label"
    :aria-controls="isExpanded ? panelId(rowId) : undefined"
    @click="onToggle"
  >
    <span :class="cn('shrink-0 text-text-secondary transition-transform duration-fast', isExpanded && 'rotate-90')">
      <ChevronRight :size="size" />
    </span>
  </Button>
</template>
