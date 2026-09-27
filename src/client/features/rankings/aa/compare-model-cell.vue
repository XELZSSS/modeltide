<script setup lang="ts">
import { computed } from "vue";
import { Check, Plus } from "@lucide/vue";
import Button from "@/client/components/ui/button.vue";
import RankingNameCell from "@/client/components/data/table/table-columns.vue";
import { useTranslation } from "@/client/i18n";
import { cn } from "@/client/utils/cn";
import { modelId } from "@/client/utils/model-utils";
import { useCompareStore } from "@/client/stores";
import type { ArtificialAnalysisModel } from "@/shared/types";

const props = defineProps<{ model: ArtificialAnalysisModel }>();

const { t } = useTranslation();
const store = useCompareStore();

const id = computed(() => modelId(props.model));
const isCompared = computed(() => store.compareIds.includes(id.value));

function onToggle(event: MouseEvent): void {
  event.stopPropagation();
  store.toggleCompareModel(props.model);
}
</script>

<template>
  <RankingNameCell :name="model.name || model.slug">
    <template #suffix>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="isCompared ? t('removeFromCompare') : t('addToCompare')"
        :aria-pressed="isCompared"
        :class="cn('shrink-0', isCompared ? 'text-accent' : 'text-text-secondary')"
        @click="onToggle"
      >
        <Check v-if="isCompared" class="size-4" />
        <Plus v-else class="size-4" />
      </Button>
    </template>
  </RankingNameCell>
</template>
