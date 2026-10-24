<script setup lang="ts">
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import CardHeader from "@/client/components/layout/card-header.vue";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import RankedListRows from "./ranked-list-rows.vue";
import type { HomeBarStat } from "./use-home-stats";

defineProps<{ rows: HomeBarStat[] }>();

const { t } = useTranslation();
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex h-full flex-col">
      <CardHeader :title="t('hallucinationStats')" :subtitle="t('hallucinationSource')" />
      <EmptyState v-if="rows.length === 0" variant="plain" compact :message="t('notAvailable')" />
      <RankedListRows v-else :rows="rows" />
    </CardContent>
  </Card>
</template>
