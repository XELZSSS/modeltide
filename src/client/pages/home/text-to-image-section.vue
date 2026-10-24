<script setup lang="ts">
import { computed } from "vue";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import CardHeader from "@/client/components/layout/card-header.vue";
import { useTranslation } from "@/client/i18n";
import { formatDollar } from "@/shared/utils";
import { staggerStyle } from "@/client/motion";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import type { TextToImageModel } from "@/shared/types";

const props = defineProps<{ models: TextToImageModel[] }>();

const { t } = useTranslation();

function formatRatingInterval(entry: TextToImageModel): string {
  if (entry.eloUpper == null || entry.eloLower == null) return "";
  return ` (${entry.eloLower.toFixed(0)}–${entry.eloUpper.toFixed(0)})`;
}

function ratingText(entry: TextToImageModel): string {
  return entry.elo != null ? `${entry.elo.toFixed(0)}${formatRatingInterval(entry)}` : t("notAvailable");
}

const rows = computed(() =>
  props.models.map((entry) => ({
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
    <CardContent class="flex h-full flex-col">
      <CardHeader :title="t('textToImage')" :subtitle="t('artificialSource')" />
      <EmptyState v-if="rows.length === 0" variant="plain" compact :message="t('notAvailable')" />
      <!-- The same 40px row as the ranked lists: the height separates the rows, so no divider is drawn. -->
      <div v-else class="flex flex-1 flex-col justify-between">
        <div
          v-for="(row, i) in rows"
          :key="row.id"
          class="flex min-h-10 min-w-0 ui-anim-rows items-center gap-3"
          :style="staggerStyle(i)"
        >
          <span class="w-6 shrink-0 text-center ui-meta font-medium tabular-nums">
            {{ i + 1 }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm" v-tooltip="row.creatorName ? `${row.name} (${row.creatorName})` : row.name">
              {{ row.name }}
              <span v-if="row.creatorName" class="ui-caption">({{ row.creatorName }})</span>
            </p>
            <p class="ui-caption">
              {{ t("elo") }}:
              <strong class="font-medium text-text-primary">{{ row.rating }}</strong>
              <template v-if="row.price">
                <span class="mx-1.5 text-text-tertiary">·</span>{{ t("price") }}:
                <strong class="font-medium text-text-primary">{{ row.price }}</strong>
              </template>
            </p>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
