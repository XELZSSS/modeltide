<script setup lang="ts">
import { computed, defineComponent, effectScope, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import BackButton from "@/client/components/layout/back-button.vue";
import DetailPageLayout from "@/client/components/layout/detail-page-layout.vue";
import PageContainer from "@/client/components/layout/page-container.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { useSuspenseArtificialRankings } from "@/client/api/api-queries";
import { useCompareModels, useCompareStore, usePruneCompareIds } from "@/client/stores";
import { modelId } from "@/client/utils/model-utils";
import CompareChipBar from "./compare-tray.vue";

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
    onUnmounted(() => scope.stop());
    const rankings = await useSuspenseArtificialRankings();
    const vm = scope.run(() => {
      const models = useCompareModels(rankings);
      usePruneCompareIds(rankings);
      const modelIds = computed(() => new Set(models.value.map(modelId).filter(Boolean)));
      const hasStaleId = computed(
        () => modelIds.value.size > 0 && loaderStore.compareIds.some((id) => !modelIds.value.has(id)),
      );
      const pruned = ref(false);
      watch(
        hasStaleId,
        (stale, _previous, onCleanup) => {
          if (!stale) return;
          const timer = setTimeout(() => {
            pruned.value = true;
          }, 0);
          onCleanup(() => clearTimeout(timer));
        },
        { immediate: true },
      );
      watch(
        pruned,
        (show, _previous, onCleanup) => {
          if (!show) return;
          const hide = setTimeout(() => {
            pruned.value = false;
          }, PRUNE_NOTICE_MS);
          onCleanup(() => clearTimeout(hide));
        },
        { immediate: true },
      );
      return { models, pruned };
    })!;
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
  <PageContainer>
    <SuspenseQuery>
      <Suspense>
        <CompareModels :back-to="props.backTo" :title="props.title">
          <template #default="{ models, pruned, clearAndBack }">
            <div v-if="models.length < 2" class="flex flex-col gap-3 items-center py-16 text-center animate-enter">
              <div class="w-full">
                <CompareChipBar :models="models" @remove="store.removeCompareModel" @clear="clearAndBack" />
              </div>
              <EmptyState :message="t('compareLimit')" compact />
              <p v-if="pruned" class="ui-caption" role="status">
                {{ t("compareStale") }}
              </p>
              <BackButton label-key="back" :to="props.backTo" />
            </div>
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
        <template #fallback>
          <DetailPageLayout
            back-label-key="back"
            :back-to="props.backTo"
            :title="props.title"
            :description="t('artificialSource')"
            compact
          >
            <div class="flex flex-col md:flex-row gap-4 sm:gap-6">
              <div class="w-full md:w-1/2 h-[240px] sm:h-[320px] ui-skeleton" aria-hidden="true" />
              <div class="w-full md:w-1/2 h-[240px] sm:h-[300px] ui-skeleton" aria-hidden="true" />
            </div>
          </DetailPageLayout>
        </template>
      </Suspense>
    </SuspenseQuery>
  </PageContainer>
</template>
