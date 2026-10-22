<script lang="ts">
type StringKey<T> = { [K in keyof T]: T[K] extends string | undefined ? K & string : never }[keyof T];

export function findModel<T>(data: T[], id: string, ...keys: StringKey<T>[]): T | undefined {
  for (const key of keys) {
    const hit = data.find((item) => item != null && (item as Record<string, unknown>)[key] === id);
    if (hit) return hit;
  }
  return undefined;
}
</script>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useDocumentTitle } from "@/client/router/document-meta";
import { useTranslation } from "@/client/i18n";
import { SOURCES } from "@/client/nav/sources";
import type { ModelSource } from "@/shared/types";
import DetailPageLayout from "@/client/components/layout/detail-page-layout.vue";

const props = defineProps<{ source: ModelSource; title: string }>();

const { t } = useTranslation();
const setTitle = useDocumentTitle();

const config = computed(() => SOURCES[props.source]);

watch(() => props.title, setTitle, { immediate: true });
</script>

<template>
  <DetailPageLayout
    :back-label-key="config.backLabelKey"
    :back-to="config.backTo"
    :title="title"
    :description="t(config.labelKey)"
  >
    <slot />
  </DetailPageLayout>
</template>
