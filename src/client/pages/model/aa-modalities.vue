<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import { MODALITY_KEYS, type ModalityKey } from "@/shared/config";
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

function modalitiesFor(prefix: "input" | "output"): ModalityKey[] {
  return MODALITY_KEYS.filter((key) =>
    Boolean(props.model[`${prefix}_modality_${key}` as keyof ArtificialAnalysisModel]),
  );
}

const inputModalities = computed(() => modalitiesFor("input"));
const outputModalities = computed(() => modalitiesFor("output"));

const hasAnyModality = computed(() =>
  MODALITY_KEYS.some((key) =>
    Boolean(
      props.model[`input_modality_${key}` as keyof ArtificialAnalysisModel] ||
      props.model[`output_modality_${key}` as keyof ArtificialAnalysisModel],
    ),
  ),
);
</script>

<template>
  <PageSection v-if="hasAnyModality" :title="t('modalities')">
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
