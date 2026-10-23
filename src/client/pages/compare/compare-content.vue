<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { useSuspenseArtificialRankings } from "@/client/api/hooks";
import { useCompareStore } from "@/client/stores";
import { useCompareModels, usePruneCompareIds } from "@/client/hooks/use-compare-models";
import { navigate } from "@/client/router";
import SafeLink from "@/client/components/ui/safe-link.vue";
import { buttonVariants } from "@/client/components/ui/button-variants";
import type { ArtificialAnalysisModel } from "@/shared/types";
import CompareChipBar from "./compare-chip-bar.vue";

const PRUNE_NOTICE_MS = 8000;

const props = defineProps<{ backTo: string }>();

defineSlots<{ default?: (slotProps: { models: ArtificialAnalysisModel[] }) => unknown }>();

const store = useCompareStore();
const { t } = useTranslation();

const rankings = await useSuspenseArtificialRankings();
const models = useCompareModels(rankings);
const pruned = ref(false);
let pruneTimer: ReturnType<typeof setTimeout> | null = null;
onUnmounted(() => {
  if (pruneTimer !== null) clearTimeout(pruneTimer);
});
usePruneCompareIds(rankings, () => {
  pruned.value = true;
  if (pruneTimer !== null) clearTimeout(pruneTimer);
  pruneTimer = setTimeout(() => {
    pruned.value = false;
    pruneTimer = null;
  }, PRUNE_NOTICE_MS);
});

function clearAndBack(): void {
  store.clearCompare();
  navigate(props.backTo, true);
}
</script>

<template>
  <div class="flex flex-col gap-4 min-w-0">
    <CompareChipBar :models="models" @remove="store.removeCompareModel" @clear="clearAndBack" />
    <div v-if="models.length < 2" class="flex flex-col gap-3 items-center py-6 text-center ui-anim-rise">
      <EmptyState :message="t('compareLimit')" compact />
      <SafeLink :href="props.backTo" :class="buttonVariants({ variant: 'primary', size: 'sm' })">
        {{ t("pickModels") }}
      </SafeLink>
    </div>
    <p v-if="pruned" class="ui-caption" role="status">{{ t("compareStale") }}</p>
    <slot v-if="models.length >= 2" :models="models" />
  </div>
</template>
