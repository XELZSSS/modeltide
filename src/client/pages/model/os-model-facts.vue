<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import { formatDate, orNA, safeHref } from "@/shared/utils";
import { encodeModelIdPath } from "@/shared/utils/models";
import { SITE_URLS } from "@/shared/config/sites";
import { TASK_LABEL_KEYS } from "@/shared/i18n/task-labels";
import InfoCard from "@/client/components/layout/info-card.vue";
import InfoGrid from "@/client/components/layout/info-grid.vue";
import InfoRow from "@/client/components/layout/info-row.vue";
import type { OpenSourceModelEntry } from "@/shared/types";

/**
 * The repository facts, printed identically by the addressable detail page and by the open-source ranking's expanded
 * row: they are one answer to one question ("what is this repository?"), and the two hand-written copies had already
 * drifted on the `task` accessor's signature. The row's own counts stay with each caller — the ranking prints them as a
 * caption line, the detail page as stat cards — because that is the part the two views deliberately say differently.
 */
const props = defineProps<{ entry: OpenSourceModelEntry }>();

const { t, lang } = useTranslation();

const dateRows = computed<[TranslationKey, string | null][]>(() => [
  ["releaseDate", props.entry.createdAt],
  ["lastUpdated", props.entry.lastModified],
]);

function taskText(task: string | null): string {
  if (!task) return t("notAvailable");
  const key = TASK_LABEL_KEYS[task];
  return key ? t(key) : task;
}

const repoHref = computed(() => safeHref(`${SITE_URLS.huggingface}/${encodeModelIdPath(props.entry.id)}`));
</script>

<template>
  <InfoGrid>
    <InfoCard :title="t('modelInfo')">
      <InfoRow :label="t('creator')">{{ orNA(entry.author, t) }}</InfoRow>
      <InfoRow :label="t('license')">{{ orNA(entry.license, t) }}</InfoRow>
      <InfoRow :label="t('task')">{{ taskText(entry.task) }}</InfoRow>
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
        class="text-sm break-all text-text-primary underline-offset-4 ui-motion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none hoverable:hover:underline"
      >
        {{ entry.id }}
      </a>
      <span v-else class="text-sm text-text-tertiary">{{ t("notAvailable") }}</span>
    </InfoCard>
  </InfoGrid>
</template>
