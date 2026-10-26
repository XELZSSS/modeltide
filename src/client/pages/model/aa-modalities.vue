<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { ModalityKey } from "@/shared/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import Badge from "@/client/components/ui/badge.vue";
import PageSection from "@/client/components/layout/page-section.vue";

// The chip surface stays muted for every modality — four tinted fills were the loudest thing in the section — and only
// the label carries the colour, so the row reads as one quiet group of metadata.
const MODALITY_STYLES: Record<ModalityKey, { className: string; labelKey: TranslationKey }> = {
  text: { className: "text-text-primary", labelKey: "modalityText" },
  image: { className: "text-info", labelKey: "modalityImage" },
  speech: { className: "text-success", labelKey: "modalitySpeech" },
  video: { className: "text-warning", labelKey: "modalityVideo" },
};

const props = defineProps<{ model: ArtificialAnalysisModel }>();

const { t } = useTranslation();

const inputModalities = computed(() => props.model.modalities.in);
const outputModalities = computed(() => props.model.modalities.out);
</script>

<template>
  <PageSection :title="t('modalities')">
    <div class="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <div class="min-w-0">
        <div class="mb-2 ui-caption font-medium">{{ t("inputModality") }}</div>
        <div class="flex flex-wrap gap-2">
          <Badge v-for="key in inputModalities" :key="key" :class="MODALITY_STYLES[key].className">
            {{ t(MODALITY_STYLES[key].labelKey) }}
          </Badge>
        </div>
      </div>
      <div class="min-w-0">
        <div class="mb-2 ui-caption font-medium">{{ t("outputModality") }}</div>
        <div class="flex flex-wrap gap-2">
          <Badge v-for="key in outputModalities" :key="key" :class="MODALITY_STYLES[key].className">
            {{ t(MODALITY_STYLES[key].labelKey) }}
          </Badge>
        </div>
      </div>
    </div>
  </PageSection>
</template>
