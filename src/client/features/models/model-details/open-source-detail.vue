<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import { formatDate, formatShortNumber, orNA } from "@/client/utils/format";
import { encodeModelIdPath, shortModelId } from "@/client/utils/model-utils";
import { useSuspenseOpenSourceModel } from "@/client/api/api-queries";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import InfoGrid from "@/client/components/ui/info-grid.vue";
import InfoCard from "@/client/components/ui/info-card.vue";
import InfoRow from "@/client/components/ui/info-row.vue";
import Badge from "@/client/components/ui/badge.vue";
import StatCard from "@/client/components/ui/stat-card.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import NotFound from "@/client/components/feedback/not-found.vue";
import DetailShell from "@/client/features/models/model-details/detail-views.vue";

const props = defineProps<{ decodedId: string }>();

const { t, lang } = useTranslation();

const model = await useSuspenseOpenSourceModel(props.decodedId);

const dateRows = computed<[TranslationKey, string | null][]>(() =>
  model.value
    ? [
        ["releaseDate", model.value.createdAt],
        ["lastUpdated", model.value.lastModified],
      ]
    : [],
);

const tags = computed(() => model.value?.tags ?? []);
</script>

<template>
  <NotFound v-if="!model" />
  <DetailShell v-else source="os" :title="shortModelId(model.id)">
    <div class="flex flex-col gap-4">
      <StatGrid :columns="2">
        <StatCard :label="t('downloads')">{{ formatShortNumber(model.downloads, t("notAvailable")) }}</StatCard>
        <StatCard :label="t('likes')">{{ formatShortNumber(model.likes, t("notAvailable")) }}</StatCard>
      </StatGrid>
      <InfoGrid>
        <InfoCard :title="t('modelInfo')">
          <InfoRow :label="t('creator')">{{ orNA(model.author, t) }}</InfoRow>
          <InfoRow :label="t('license')">{{ orNA(model.license, t) }}</InfoRow>
          <InfoRow :label="t('task')">{{ orNA(model.task, t) }}</InfoRow>
          <InfoRow v-for="([labelKey, value]) in dateRows" :key="labelKey" :label="t(labelKey)">
            {{ value ? formatDate(value, lang) : t("notAvailable") }}
          </InfoRow>
        </InfoCard>
        <InfoCard :title="t('repository')">
          <a
            v-if="model.id"
            :href="`https://huggingface.co/${encodeModelIdPath(model.id)}`"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-accent break-all underline-offset-4 transition-colors duration-fast hoverable:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
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
