<script setup lang="ts">
import { computed, watch } from "vue";
import { ArrowLeftRight, Trash2, X } from "@lucide/vue";
import Button from "@/client/components/ui/button.vue";
import Badge from "@/client/components/ui/badge.vue";
import { useTranslation } from "@/client/i18n";
import { useCompareStore } from "@/client/stores";
import { modelDisplayName } from "@/shared/utils/models";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelKeyOf } from "@/client/utils/compare-logic";

const LIMIT_NOTICE_MS = 2500;

const props = defineProps<{ models: ArtificialAnalysisModel[]; showCompare?: boolean }>();

const emit = defineEmits<{
  remove: [model: ArtificialAnalysisModel];
  clear: [];
  compare: [];
}>();

const { t } = useTranslation();
const store = useCompareStore();

const hasCompare = computed(() => props.showCompare === true);
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
  <div v-if="models.length > 0" class="flex ui-card flex-wrap items-center justify-between gap-3 px-3 py-2.5">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <slot name="leading" />
      <!--
        The remove button is a 36px tap target pulled back over the pill's 30px box with `-m-1.5`, so its box sticks
        out 2px on the right and 3px on each side vertically. `Badge` clips that, which is what keeps the button from
        painting its hover background outside the pill; its focus ring is `ring-inset` for the same reason.
      -->
      <Badge
        v-for="(model, index) in models"
        :key="modelKeyOf(model, index)"
        class="ui-anim-pop border-border py-1 pr-1 pl-3 text-sm leading-5 text-text-primary"
      >
        <span class="max-w-36 truncate font-medium" v-tooltip="modelDisplayName(model)">{{
          modelDisplayName(model)
        }}</span>
        <button
          type="button"
          :aria-label="t('removeModel', { name: modelDisplayName(model) })"
          class="-m-1.5 flex size-9 shrink-0 items-center justify-center text-text-secondary ui-motion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset hoverable:hover:text-text-primary"
          @click="emit('remove', model)"
        >
          <X :size="14" />
        </button>
      </Badge>
    </div>
    <div class="flex w-full gap-2 sm:w-auto">
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
    <p v-if="hasCompare && !canCompare && models.length > 0" class="w-full ui-caption">{{ t("compareLimit") }}</p>
    <p v-if="showLimit" class="w-full ui-anim-rise ui-caption text-warning" role="alert">
      {{ t("compareLimitTwo") }}
    </p>
  </div>
</template>
