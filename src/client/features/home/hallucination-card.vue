<script setup lang="ts">
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import type { HomeBarStat } from "./use-home-stats";

defineProps<{ rows: HomeBarStat[] }>();

const { t } = useTranslation();
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex flex-col h-full">
      <CardHeader :title="t('hallucinationStats')" :subtitle="t('hallucinationSource')" />
      <EmptyState v-if="rows.length === 0" variant="plain" compact :message="t('notAvailable')" />
      <div v-else class="flex flex-1 flex-col gap-1 justify-between">
        <div v-for="(row, i) in rows" :key="`${row.label}#${i + 1}`" class="flex h-9 items-center gap-3 min-w-0">
          <span class="text-xs font-medium text-text-tertiary w-6 text-center shrink-0 tabular-nums">
            {{ i + 1 }}
          </span>
          <span class="text-sm truncate min-w-0 flex-1">{{ row.label }}</span>
          <span class="ui-mono-value shrink-0">{{ row.valueLabel }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
