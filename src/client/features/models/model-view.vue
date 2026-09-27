<script setup lang="ts">
import { computed, defineComponent, h, type Component, type ComputedRef } from "vue";
import { useRoute } from "vue-router";
import { useSuspenseArtificialRankingsState, useSuspenseOpenRouterRankings } from "@/client/api/api-queries";
import { isPartialPayload, unwrapList } from "@/client/api/payload-normalize";
import { MODEL_SOURCES, type ModelSource } from "@/client/config/nav-config";
import { loadableView } from "@/client/router/lazy-view";
import NotFound from "@/client/components/feedback/not-found.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import PageContainer from "@/client/components/layout/page-container.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import DetailShell, { findModel } from "@/client/features/models/model-details/detail-views.vue";
import type { ArtificialAnalysisModel, OpenRouterRankEntry } from "@/shared/types";

const AaContent = loadableView(() => import("@/client/features/models/model-details/aa-detail.vue"));
const OrContent = loadableView(() => import("@/client/features/models/model-details/openrouter-detail.vue"));
const OpenSourceDetail = loadableView(() => import("@/client/features/models/model-details/open-source-detail.vue"));
const HallucinationDetail = loadableView(() => import("@/client/features/models/model-details/hallucination-detail.vue"));

function isModelSource(value: string): value is ModelSource {
  return Object.hasOwn(MODEL_SOURCES, value);
}

function createDetailView<T>(
  source: ModelSource,
  Content: Component<{ model: T }>,
  load: () => Promise<{ data: ComputedRef<T[]>; partial: ComputedRef<boolean> }>,
  titleOf: (model: T) => string,
  ...keys: (keyof T & string)[]
): Component {
  return defineComponent({
    props: { decodedId: { type: String, required: true } },
    async setup(props) {
      const { data, partial } = await load();
      const model = computed(() => findModel(data.value, props.decodedId, ...keys));
      return () => {
        const found = model.value;
        if (!found) return h(NotFound);
        return h(
          DetailShell,
          { source, title: titleOf(found) },
          { default: () => [partial.value ? h(PartialNotice) : null, h(Content, { model: found })] },
        );
      };
    },
  });
}

const AaDetailView = createDetailView<ArtificialAnalysisModel>(
  "aa",
  AaContent,
  async () => {
    const state = await useSuspenseArtificialRankingsState();
    return { data: computed(() => state.value.items), partial: computed(() => state.value.partial) };
  },
  (model) => model.name,
  "id",
  "slug",
);

const OrDetailView = createDetailView<OpenRouterRankEntry>(
  "or",
  OrContent,
  async () => {
    const query = await useSuspenseOpenRouterRankings();
    return {
      data: computed(() => unwrapList<OpenRouterRankEntry>(query.data.value, "openRouterRankings")),
      partial: computed(() => isPartialPayload(query.data.value)),
    };
  },
  (model) => model.name,
  "id",
);

const route = useRoute();

const rawId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));

const source = computed<ModelSource | null>(() => {
  const value = rawId.value.split("/")[0] ?? "";
  return isModelSource(value) ? value : null;
});

const decodedId = computed(() => {
  const at = rawId.value.indexOf("/");
  return at < 0 ? "" : rawId.value.slice(at + 1);
});
</script>

<template>
  <SuspenseQuery>
    <NotFound v-if="!source || !decodedId" />
    <PageContainer v-else>
      <AaDetailView v-if="source === 'aa'" :key="decodedId" :decoded-id="decodedId" />
      <OrDetailView v-else-if="source === 'or'" :key="decodedId" :decoded-id="decodedId" />
      <OpenSourceDetail v-else-if="source === 'os'" :key="decodedId" :decoded-id="decodedId" />
      <HallucinationDetail v-else :key="decodedId" :decoded-id="decodedId" />
    </PageContainer>
  </SuspenseQuery>
</template>
