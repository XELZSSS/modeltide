<script setup lang="ts">
import { computed } from "vue";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import CardHeader from "@/client/components/ui/card-header.vue";
import { useTranslation } from "@/client/i18n";
import { formatDollar } from "@/client/utils/format";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import type { TextToImageModel } from "@/shared/types";

const TOP_T2I = 6;

const props = defineProps<{ models: TextToImageModel[] }>();

const { t } = useTranslation();

function formatRatingInterval(entry: TextToImageModel): string {
  if (entry.eloUpper == null || entry.eloLower == null) return "";
  return ` (${entry.eloLower.toFixed(0)}–${entry.eloUpper.toFixed(0)})`;
}

function ratingText(entry: TextToImageModel): string {
  return entry.elo != null ? `${entry.elo.toFixed(0)}${formatRatingInterval(entry)}` : t("notAvailable");
}

// Derive the row view models once instead of on every render.
const rows = computed(() =>
  props.models.slice(0, TOP_T2I).map((entry) => ({
    id: entry.id,
    name: entry.name,
    creatorName: entry.creatorName,
    rating: ratingText(entry),
    price: entry.pricePer1kImages != null ? `${formatDollar(entry.pricePer1kImages, t)}${t("per1kImages")}` : null,
  })),
);
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex flex-col h-full">
      <CardHeader :title="t('textToImage')" :subtitle="t('artificialSource')" />
      <EmptyState v-if="rows.length === 0" variant="plain" compact :message="t('notAvailable')" />
      <div v-else class="flex flex-1 flex-col gap-1 justify-between">
        <div v-for="(row, i) in rows" :key="row.id" class="flex h-11 items-center gap-3 min-w-0">
          <span class="text-xs font-medium text-text-tertiary w-6 text-center shrink-0 tabular-nums">
            {{ i + 1 }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm truncate">
              {{ row.name }}
              <span v-if="row.creatorName" class="ui-caption">({{ row.creatorName }})</span>
            </p>
            <p class="ui-caption truncate">
              {{ t("elo") }}:
              <strong class="text-text-primary font-semibold">{{ row.rating }}</strong>
              <template v-if="row.price">
                <span class="mx-1.5 text-text-tertiary">·</span>{{ t("price") }}:
                <strong class="text-text-primary font-semibold">{{ row.price }}</strong>
              </template>
            </p>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
