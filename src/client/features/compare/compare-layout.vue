<script setup lang="ts">
import { defineComponent, effectScope, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import BackButton from "@/client/components/layout/back-button.vue";
import DetailPageLayout from "@/client/components/layout/detail-page-layout.vue";
import PageContainer from "@/client/components/layout/page-container.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { useSuspenseArtificialRankings } from "@/client/api/api-queries";
import { useCompareModels, useCompareStore, usePruneCompareIds } from "@/client/stores";
import CompareChipBar from "@/client/components/compare-chip-bar.vue";

const PRUNE_NOTICE_MS = 8000;

const props = defineProps<{ backTo: string; title: string }>();

const store = useCompareStore();
const { t } = useTranslation();

const CompareModels = defineComponent({
  props: { backTo: { type: String, required: true }, title: { type: String, required: true } },
  async setup(loaderProps, { slots }) {
    const router = useRouter();
    const loaderStore = useCompareStore();
    const scope = effectScope(true);
    let pruneTimer: ReturnType<typeof setTimeout> | null = null;
    onUnmounted(() => {
      if (pruneTimer !== null) clearTimeout(pruneTimer);
      scope.stop();
    });
    const rankings = await useSuspenseArtificialRankings();
    const vm = scope.run(() => {
      const models = useCompareModels(rankings);
      const pruned = ref(false);
      usePruneCompareIds(rankings, () => {
        pruned.value = true;
        if (pruneTimer !== null) clearTimeout(pruneTimer);
        pruneTimer = setTimeout(() => {
          pruned.value = false;
          pruneTimer = null;
        }, PRUNE_NOTICE_MS);
      });
      return { models, pruned };
    });
    if (!vm) return () => null;
    function clearAndBack(): void {
      loaderStore.clearCompare();
      void router.replace(loaderProps.backTo);
    }
    return () =>
      slots.default?.({
        models: vm.models.value,
        pruned: vm.pruned.value,
        clearAndBack,
      }) ?? null;
  },
});
</script>

<template>
  <SuspenseQuery>
    <CompareModels :back-to="props.backTo" :title="props.title">
      <template #default="{ models, pruned, clearAndBack }">
        <PageContainer v-if="models.length < 2">
          <div class="flex flex-col gap-3 items-center py-16 text-center animate-enter">
            <div class="w-full">
              <CompareChipBar :models="models" @remove="store.removeCompareModel" @clear="clearAndBack" />
            </div>
            <EmptyState :message="t('compareLimit')" compact />
            <p v-if="pruned" class="ui-caption" role="status">
              {{ t("compareStale") }}
            </p>
            <BackButton label-key="back" :to="props.backTo" />
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
    </CompareModels>
  </SuspenseQuery>
</template>
