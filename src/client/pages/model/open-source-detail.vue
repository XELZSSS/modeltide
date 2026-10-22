<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import { formatDate, formatShortNumber, orNA, safeHref } from "@/shared/utils";
import { encodeModelIdPath, shortModelId } from "@/shared/utils/models";
import { TASK_LABEL_KEYS } from "@/client/pages/home/task-share";
import { useSuspenseOpenSourceModelState } from "@/client/api/hooks";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import StatGrid from "@/client/components/layout/stat-grid.vue";
import InfoGrid from "@/client/components/layout/info-grid.vue";
import InfoCard from "@/client/components/layout/info-card.vue";
import InfoRow from "@/client/components/layout/info-row.vue";
import Badge from "@/client/components/ui/badge.vue";
import StatCard from "@/client/components/layout/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import { DETAIL_BLOCK_GAP } from "@/client/nav/layout";
import NotFound from "@/client/components/feedback/not-found.vue";
import { useSoftNotFound } from "@/client/router/document-meta";
import DetailShell from "./detail-views.vue";

const props = defineProps<{ decodedId: string }>();

const { t, lang } = useTranslation();

const state = await useSuspenseOpenSourceModelState(props.decodedId);
const model = computed(() => state.value.items[0] ?? null);
const partial = computed(() => state.value.partial);

useSoftNotFound(computed(() => !model.value));

const dateRows = computed<[TranslationKey, string | null][]>(() =>
  model.value
    ? [
        ["releaseDate", model.value.createdAt],
        ["lastUpdated", model.value.lastModified],
      ]
    : [],
);

const tags = computed(() => model.value?.tags ?? []);

function taskText(task: string | null | undefined): string {
  if (!task) return t("notAvailable");
  const key = TASK_LABEL_KEYS[task];
  return key ? t(key) : task;
}

const repoHref = computed(() =>
  model.value?.id ? safeHref(`https://huggingface.co/${encodeModelIdPath(model.value.id)}`) : undefined,
);
</script>

<template>
  <NotFound v-if="!model" heading-key="modelNotFoundTitle" body-key="modelNotFound" :code="null" />
  <DetailShell v-else source="os" :title="shortModelId(model.id)">
    <div :class="DETAIL_BLOCK_GAP">
      <PartialNotice v-if="partial" />
      <StatGrid :columns="2">
        <StatCard :label="t('downloads')">{{ formatShortNumber(model.downloads, t("notAvailable")) }}</StatCard>
        <StatCard :label="t('likes')">{{ formatShortNumber(model.likes, t("notAvailable")) }}</StatCard>
      </StatGrid>
      <InfoGrid>
        <InfoCard :title="t('modelInfo')">
          <InfoRow :label="t('creator')">{{ orNA(model.author, t) }}</InfoRow>
          <InfoRow :label="t('license')">{{ orNA(model.license, t) }}</InfoRow>
          <InfoRow :label="t('task')">{{ taskText(model.task) }}</InfoRow>
          <InfoRow v-for="[labelKey, value] in dateRows" :key="labelKey" :label="t(labelKey)">
            {{ value ? formatDate(value, lang) : t("notAvailable") }}
          </InfoRow>
        </InfoCard>
        <InfoCard :title="t('repository')">
          <a
            v-if="repoHref"
            :href="repoHref"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-accent break-all underline-offset-4 ui-motion hoverable:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {{ model.id }}
          </a>
          <span v-else class="text-sm text-text-tertiary">{{ t("notAvailable") }}</span>
        </InfoCard>
      </InfoGrid>
      <PageSection v-if="tags.length > 0" :title="t('tags')">
        <div class="flex flex-wrap gap-2">
          <Badge v-for="tag in tags" :key="tag">{{ tag }}</Badge>
        </div>
      </PageSection>
    </div>
  </DetailShell>
</template>
