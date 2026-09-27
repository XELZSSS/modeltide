<script lang="ts">
export interface HomeBarStat {
  label: string;
  value: number;
  valueLabel: string;
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import { useTranslation } from "@/client/i18n";

const props = defineProps<{ trendingStats: HomeBarStat[]; hallucinationStats: HomeBarStat[] }>();

const { t } = useTranslation();

const panels = computed(() => [
  {
    title: t("openSourceTrendingStats"),
    source: t("huggingFaceSource"),
    rows: props.trendingStats,
  },
  {
    title: t("hallucinationStats"),
    source: t("hallucinationSource"),
    rows: props.hallucinationStats,
  },
]);
</script>

<template>
  <PageSection :title="t('statistics')">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card v-for="panel in panels" :key="panel.title">
        <CardContent>
          <CardHeader :title="panel.title" :subtitle="panel.source" />
          <p v-if="panel.rows.length === 0" class="ui-body-secondary">{{ t("notAvailable") }}</p>
          <div v-else class="flex flex-col gap-1">
            <div v-for="(row, i) in panel.rows" :key="`${row.label}#${i + 1}`" class="flex items-center gap-3 h-8">
              <span class="text-xs font-medium text-text-tertiary w-6 text-center shrink-0 tabular-nums">
                {{ i + 1 }}
              </span>
              <span class="text-sm truncate min-w-0 flex-1">{{ row.label }}</span>
              <span class="ui-mono-value shrink-0">{{ row.valueLabel }}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </PageSection>
</template>
