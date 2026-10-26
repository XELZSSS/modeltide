<script setup lang="ts">
import { useSuspenseDecisionIndexState } from "@/client/api/view-models";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";
import ModelMiss from "@/client/components/feedback/model-miss.vue";
import DecisionFacts from "./decision-facts.vue";
import DetailShell from "./detail-views.vue";
import { useModelLookup } from "./use-model-lookup";

const props = defineProps<{ decodedId: string }>();

// The decision ranking is one payload of every contestant, so its detail page reads the row straight out of that list:
// a per-contestant endpoint would serve the same payload over again for one row.
const state = await useSuspenseDecisionIndexState();
const { model, partial } = useModelLookup(
  () => state.value.items.find((item) => item.id === props.decodedId),
  () => state.value.partial,
);
</script>

<template>
  <ModelMiss v-if="!model" :partial="partial" />
  <DetailShell v-else source="decision" :title="model.name">
    <div :class="DETAIL_BLOCK_GAP">
      <PartialNotice v-if="partial" />
      <DecisionFacts :entry="model" />
    </div>
  </DetailShell>
</template>
