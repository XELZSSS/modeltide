<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight } from "@lucide/vue";
import Button from "@/client/components/ui/button.vue";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";
import type { RowListEmits } from "./cell-view";

const panelId = (rowId: string): string => `${rowId}-panel`;

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
