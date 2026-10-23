<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import BackButton from "@/client/shell/back-button.vue";
import DetailPageLayout from "@/client/components/layout/detail-page-layout.vue";
import PageContainer from "@/client/components/layout/page-container.vue";
import { useSuspenseArtificialRankings } from "@/client/api/hooks";
import { useCompareStore } from "@/client/stores";
import { useCompareModels, usePruneCompareIds } from "@/client/hooks/use-compare-models";
import { navigate } from "@/client/router";
import SafeLink from "@/client/components/ui/safe-link.vue";
import { buttonVariants } from "@/client/components/ui/button-variants";
import CompareChipBar from "./compare-chip-bar.vue";

const PRUNE_NOTICE_MS = 8000;

const props = defineProps<{ backTo: string; title: string }>();

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
  <PageContainer v-if="models.length < 2">
    <div class="flex flex-col gap-4">
      <BackButton label-key="back" :to="props.backTo" />
      <div class="flex flex-col gap-3 items-center py-12 text-center ui-anim-rise">
        <div class="w-full">
          <CompareChipBar :models="models" @remove="store.removeCompareModel" @clear="clearAndBack" />
        </div>
        <EmptyState :message="t('compareLimit')" compact />
        <p v-if="pruned" class="ui-caption" role="status">
          {{ t("compareStale") }}
        </p>
        <SafeLink :href="props.backTo" :class="buttonVariants({ variant: 'primary', size: 'sm' })">
          {{ t("pickModels") }}
        </SafeLink>
      </div>
    </div>
  </PageContainer>
  <DetailPageLayout
    v-else
    back-label-key="back"
    :back-to="props.backTo"
    :title="props.title"
    :description="t('artificialSource')"
    compact
  >
    <CompareChipBar :models="models" @remove="store.removeCompareModel" @clear="clearAndBack" />
    <slot :models="models" />
  </DetailPageLayout>
</template>
