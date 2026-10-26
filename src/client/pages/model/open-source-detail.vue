<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { formatShortNumber } from "@/shared/utils";
import { shortModelId } from "@/shared/utils/models";
import { useSuspenseOpenSourceModelState } from "@/client/api/view-models";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import Badge from "@/client/components/ui/badge.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";
import ModelMiss from "@/client/components/feedback/model-miss.vue";
import OsModelFacts from "./os-model-facts.vue";
import DetailShell from "./detail-views.vue";
import { useModelLookup } from "./use-model-lookup";

const props = defineProps<{ decodedId: string }>();

const { t } = useTranslation();

const state = await useSuspenseOpenSourceModelState(props.decodedId);
const { model, partial } = useModelLookup(
  () => state.value.items[0],
  () => state.value.partial,
);

/** The by-id payload is the only one that carries tags; the list route omits the key. */
const tags = computed(() => model.value?.tags ?? []);
</script>

<template>
  <ModelMiss v-if="!model" :partial="partial" />
  <DetailShell v-else source="os" :title="shortModelId(model.id)">
    <div :class="DETAIL_BLOCK_GAP">
      <PartialNotice v-if="partial" />
      <StatGrid :columns="2">
        <StatCard :label="t('downloads')">{{ formatShortNumber(model.downloads, t("notAvailable")) }}</StatCard>
        <StatCard :label="t('likes')">{{ formatShortNumber(model.likes, t("notAvailable")) }}</StatCard>
      </StatGrid>
      <OsModelFacts :entry="model" />
      <PageSection v-if="tags.length > 0" :title="t('tags')">
        <div class="flex flex-wrap gap-2">
          <!-- `Badge` is `whitespace-nowrap` + `overflow-hidden`, so its own text is hard-clipped: a
               `base_model:finetune:...` tag (routinely 40+ characters) lost its tail with no ellipsis and no
               tooltip. The truncating child is what the Badge contract asks for. -->
          <Badge v-for="tag in tags" :key="tag">
            <span class="min-w-0 break-words whitespace-normal md:truncate" v-tooltip="tag">{{ tag }}</span>
          </Badge>
        </div>
      </PageSection>
    </div>
  </DetailShell>
</template>
