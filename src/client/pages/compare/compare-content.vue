<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useSuspenseArtificialRankingsState } from "@/client/api/hooks";
import { useCompareStore } from "@/client/stores";
import { useCompareModels, usePruneCompareIds } from "@/client/hooks/use-compare-models";
import { navigate } from "@/client/router";
import SafeLink from "@/client/components/ui/safe-link.vue";
import { buttonVariants } from "@/client/components/ui/button-variants";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import type { ArtificialAnalysisModel } from "@/shared/types";
import CompareChipBar from "@/client/components/navigation/compare-chip-bar.vue";

const PRUNE_NOTICE_MS = 8000;

const props = defineProps<{ backTo: string }>();

defineSlots<{ default?: (slotProps: { models: ArtificialAnalysisModel[] }) => unknown }>();

const store = useCompareStore();
const { t } = useTranslation();

const state = await useSuspenseArtificialRankingsState();
const rankings = computed(() => state.value.items);
const models = useCompareModels(rankings);
const pruned = ref(false);
let pruneTimer: ReturnType<typeof setTimeout> | null = null;
onUnmounted(() => {
  if (pruneTimer !== null) clearTimeout(pruneTimer);
});
usePruneCompareIds(
  rankings,
  () => {
    pruned.value = true;
    if (pruneTimer !== null) clearTimeout(pruneTimer);
    pruneTimer = setTimeout(() => {
      pruned.value = false;
      pruneTimer = null;
    }, PRUNE_NOTICE_MS);
  },
  () => state.value.partial,
);

function clearAndBack(): void {
  store.clearCompare();
  navigate(props.backTo, true);
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <PartialNotice v-if="state.partial" />
    <CompareChipBar :models="models" @remove="store.removeCompareModel" @clear="clearAndBack" />
    <div v-if="models.length < 2" class="flex ui-anim-rise flex-col items-center gap-3 py-6 text-center">
      <EmptyState :message="t('compareLimit')" compact />
      <SafeLink :href="props.backTo" :class="buttonVariants({ variant: 'primary', size: 'sm' })">
        {{ t("pickModels") }}
      </SafeLink>
    </div>
    <p v-if="pruned" class="ui-caption" role="status">{{ t("compareStale") }}</p>
    <slot v-if="models.length >= 2" :models="models" />
  </div>
</template>
