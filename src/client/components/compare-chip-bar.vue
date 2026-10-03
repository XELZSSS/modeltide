<script setup lang="ts">
import { computed, getCurrentInstance, watch } from "vue";
import { ArrowLeftRight, Trash2, X } from "@lucide/vue";
import Button from "@/client/components/ui/button.vue";
import Badge from "@/client/components/ui/badge.vue";
import { useTranslation } from "@/client/i18n";
import { useCompareStore } from "@/client/stores";
import { modelDisplayName } from "@/shared/utils/models";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelKeyOf } from "@/client/utils/compare-logic";

const LIMIT_NOTICE_MS = 2500;

const props = defineProps<{ models: ArtificialAnalysisModel[] }>();

const emit = defineEmits<{
  remove: [model: ArtificialAnalysisModel];
  clear: [];
  compare: [];
}>();

const { t } = useTranslation();
const store = useCompareStore();

const hasCompare = getCurrentInstance()?.vnode.props?.onCompare != null;
const showLimit = computed(() => store.exceedAt != null);
const canCompare = computed(() => props.models.length >= 2);

watch(
  () => store.exceedAt,
  (exceedAt, _previous, onCleanup) => {
    if (exceedAt == null) return;
    const timer = setTimeout(() => store.clearExceed(), LIMIT_NOTICE_MS);
    onCleanup(() => clearTimeout(timer));
  },
  { immediate: true },
);
</script>

<template>
  <div class="ui-card flex flex-wrap gap-3 items-center justify-between px-3 py-2.5">
    <div class="flex flex-wrap gap-2 items-center min-w-0">
      <slot name="leading" />
      <Badge
        v-for="(model, index) in models"
        :key="modelKeyOf(model, index)"
        class="pl-3 pr-1 py-1 text-sm normal-case tracking-normal text-text-primary hoverable:hover:border-text-tertiary/40"
      >
        <span class="font-medium truncate max-w-36">{{ modelDisplayName(model) }}</span>
        <button
          type="button"
          :aria-label="t('removeModel', { name: modelDisplayName(model) })"
          class="shrink-0 p-1 text-text-secondary hoverable:hover:text-text-primary hoverable:hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          @click="emit('remove', model)"
        >
          <X :size="14" />
        </button>
      </Badge>
    </div>
    <div class="flex gap-2 w-full sm:w-auto">
      <Button size="sm" variant="outline" class="flex-1 sm:flex-none" @click="emit('clear')">
        <Trash2 :size="14" /> {{ t("clear") }}
      </Button>
      <Button
        v-if="hasCompare"
        size="sm"
        :variant="canCompare ? 'primary' : 'outline'"
        :disabled="!canCompare"
        class="flex-1 sm:flex-none"
        @click="emit('compare')"
      >
        <ArrowLeftRight :size="14" /> {{ t("compareSelected") }}
      </Button>
    </div>
    <p v-if="hasCompare && !canCompare && models.length > 0" class="ui-caption w-full">{{ t("compareLimit") }}</p>
    <p v-if="showLimit" class="ui-caption text-warning w-full animate-enter" role="alert">
      {{ t("compareLimitTwo") }}
    </p>
  </div>
</template>
