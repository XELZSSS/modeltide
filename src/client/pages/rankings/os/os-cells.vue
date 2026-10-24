<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import { formatShortNumber } from "@/shared/utils";
import OsModelFacts from "@/client/pages/model/os-model-facts.vue";
import type { OpenSourceModelEntry } from "@/shared/types";

/**
 * The expanded row of the open-source ranking. Everything it shows is already on the row — the ranking payload carries the
 * whole entry — so opening a model costs no request; the detail page behind the name is there for the addressable view.
 * The facts block is the same component that page prints.
 */
defineProps<{ model: OpenSourceModelEntry }>();

const { t } = useTranslation();
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <p class="ui-caption">
      {{ t("downloads") }}: {{ formatShortNumber(model.downloads, t("notAvailable")) }}
      <span class="mx-1.5 text-text-tertiary">·</span>{{ t("likes") }}:
      {{ formatShortNumber(model.likes, t("notAvailable")) }}
    </p>
    <OsModelFacts :entry="model" />
  </div>
</template>
