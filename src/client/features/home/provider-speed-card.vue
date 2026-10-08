<script setup lang="ts">
import { computed } from "vue";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import LabeledDot from "@/client/components/ui/labeled-dot.vue";
import { useTranslation } from "@/client/i18n";
import { formatSpeed } from "@/client/utils/format";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import RankedListRows from "./ranked-list-rows.vue";
import type { HomeProviderStat } from "./use-home-stats";

const TOP_PROVIDERS = 7;

const props = defineProps<{ providerStats: HomeProviderStat[] }>();

const { t } = useTranslation();
const topProviders = computed(() => props.providerStats.slice(0, TOP_PROVIDERS));

const rankedProviders = computed(() =>
  topProviders.value.map((p) => ({
    label: p.name,
    valueLabel: `${formatSpeed(p.avgSpeed, t)} ${t("tokensPerSecond")}`,
    color: p.color,
  })),
);
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex flex-col h-full">
      <CardHeader :title="t('providerSpeed')" :subtitle="t('artificialSource')" />
      <EmptyState v-if="topProviders.length === 0" variant="plain" compact :message="t('notAvailable')" />
      <RankedListRows v-else :rows="rankedProviders">
        <template #label="{ row }">
          <LabeledDot :color="row.color" class="flex-1" :title="row.label">{{ row.label }}</LabeledDot>
        </template>
      </RankedListRows>
    </CardContent>
  </Card>
</template>
