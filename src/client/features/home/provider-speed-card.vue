<script setup lang="ts">
import { computed } from "vue";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import LabeledDot from "@/client/components/ui/labeled-dot.vue";
import { useTranslation } from "@/client/i18n";
import { formatSpeed } from "@/client/utils/format";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import type { HomeProviderStat } from "./use-home-stats";

const TOP_PROVIDERS = 7;

const props = defineProps<{ providerStats: HomeProviderStat[] }>();

const { t } = useTranslation();

const topProviders = computed(() => props.providerStats.slice(0, TOP_PROVIDERS));
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex flex-col h-full">
      <CardHeader :title="t('providerSpeed')" :subtitle="t('artificialSource')" />
      <EmptyState v-if="topProviders.length === 0" variant="plain" compact :message="t('notAvailable')" />
      <div v-else class="flex flex-1 flex-col gap-1 justify-between">
        <div v-for="(p, i) in topProviders" :key="p.name" class="flex h-9 items-center gap-3 min-w-0">
          <span class="text-xs font-medium text-text-tertiary w-6 text-center shrink-0 tabular-nums">
            {{ i + 1 }}
          </span>
          <LabeledDot :color="p.color" class="flex-1">{{ p.name }}</LabeledDot>
          <span class="ui-mono-value shrink-0">{{ formatSpeed(p.avgSpeed, t) }} {{ t("tokensPerSecond") }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
