<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import type { TranslationKey } from "@/shared/i18n";
import { MODALITY_KEYS, type ModalityKey } from "@/shared/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import Badge from "@/client/components/ui/badge.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import { cn } from "@/client/utils/cn";

const MODALITY_STYLES: Record<ModalityKey, { className: string; labelKey: TranslationKey }> = {
  text: { className: "border-accent/30 bg-accent-light text-accent", labelKey: "modalityText" },
  image: { className: "border-info/30 bg-info-light text-info", labelKey: "modalityImage" },
  speech: { className: "border-success/30 bg-success-light text-success", labelKey: "modalitySpeech" },
  video: { className: "border-warning/30 bg-warning-light text-warning", labelKey: "modalityVideo" },
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
    <div class="flex flex-col gap-4 md:flex-row md:gap-12">
      <div>
        <div class="ui-caption font-medium mb-2.5">{{ t("inputModality") }}</div>
        <div class="flex gap-2 flex-wrap">
          <Badge
            v-for="key in inputModalities"
            :key="key"
            :class="cn('px-2.5 py-1 normal-case tracking-normal', MODALITY_STYLES[key].className)"
          >
            {{ t(MODALITY_STYLES[key].labelKey) }}
          </Badge>
        </div>
      </div>
      <div>
        <div class="ui-caption font-medium mb-2.5">{{ t("outputModality") }}</div>
        <div class="flex gap-2 flex-wrap">
          <Badge
            v-for="key in outputModalities"
            :key="key"
            :class="cn('px-2.5 py-1 normal-case tracking-normal', MODALITY_STYLES[key].className)"
          >
            {{ t(MODALITY_STYLES[key].labelKey) }}
          </Badge>
        </div>
      </div>
    </div>
  </PageSection>
</template>
