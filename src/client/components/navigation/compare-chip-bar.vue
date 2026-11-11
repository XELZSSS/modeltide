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
        The remove control keeps a 40px touch box (36px from `md`) pulled back over the pill with `-m-1.5`, but its
        fill and focus ring are painted on a 20px disc inside that box. A background on the box itself is clipped by
        the badge's `overflow-hidden` at three edges, which cuts the rounded corners mid-arc; the disc never reaches
        an edge, so the hover state stays whole.
      -->
      <Badge
        v-for="(model, index) in models"
        :key="modelKeyOf(model, index)"
        class="ui-anim-pop border-border py-1 pr-1 pl-3 ui-label text-text-primary"
      >
        <span
          class="max-w-36 font-medium break-words whitespace-normal md:truncate"
          v-tooltip="modelDisplayName(model)"
          >{{ modelDisplayName(model) }}</span
        >
        <button
          type="button"
          :aria-label="t('removeModel', { name: modelDisplayName(model) })"
          class="group -m-1.5 flex size-10 shrink-0 items-center justify-center rounded-md text-text-secondary ui-motion focus-visible:outline-none md:size-9"
          @click="emit('remove', model)"
        >
          <span
            class="flex size-5 items-center justify-center rounded-full ui-motion group-focus-visible:bg-surface-hover group-focus-visible:text-text-primary group-focus-visible:ring-2 group-focus-visible:ring-ring [@media(hover:hover)]:group-hover:bg-surface-hover [@media(hover:hover)]:group-hover:text-text-primary"
          >
            <X :size="14" />
          </span>
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
    <p v-if="hasCompare && !canCompare" class="w-full ui-caption">{{ t("compareLimit") }}</p>
    <p v-if="showLimit" class="w-full ui-caption text-warning" role="alert">
      {{ t("compareLimitTwo") }}
    </p>
  </div>
</template>
