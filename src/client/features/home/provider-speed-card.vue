<script setup lang="ts">
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import LabeledDot from "@/client/components/ui/labeled-dot.vue";
import { useTranslation } from "@/client/i18n";
import { formatSpeed } from "@/client/utils/format";
import type { HomeProviderStat } from "./use-home-stats";

defineProps<{ providerStats: HomeProviderStat[] }>();

const { t } = useTranslation();
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex flex-col h-full">
      <CardHeader :title="t('providerSpeed')" :subtitle="t('artificialSource')" />
      <div class="flex flex-col gap-3 flex-1 justify-between">
        <div
          v-for="p in providerStats.slice(0, 6)"
          :key="p.name"
          class="flex items-center justify-between gap-3 min-w-0"
        >
          <LabeledDot :color="p.color" class="flex-1">{{ p.name }}</LabeledDot>
          <span class="text-sm font-semibold font-mono ml-3 shrink-0">
            {{ formatSpeed(p.avgSpeed, t) }} {{ t("tokensPerSecond") }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
