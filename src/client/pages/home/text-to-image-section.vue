<script setup lang="ts">
import { computed } from "vue";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import CardHeader from "@/client/components/layout/card-header.vue";
import { useTranslation } from "@/client/i18n";
import type { TFunction } from "@/shared/i18n";
import { formatDollar, formatScore } from "@/shared/utils";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import RankedListRows from "./ranked-list-rows.vue";
import type { TextToImageModel } from "@/shared/types";

interface ImageModelRow {
  /** The name, which is what `RankedListRows` keys a row on. */
  label: string;
  creatorName: string | null;
  rating: string;
  price: string | null;
}

const props = defineProps<{ models: TextToImageModel[] }>();

const { t } = useTranslation();

function formatRatingInterval(entry: TextToImageModel, t: TFunction): string {
  if (entry.eloUpper == null || entry.eloLower == null) return "";
  return ` (${formatScore(entry.eloLower, t)}–${formatScore(entry.eloUpper, t)})`;
}

function ratingText(entry: TextToImageModel, t: TFunction): string {
  return entry.elo != null ? `${formatScore(entry.elo, t)}${formatRatingInterval(entry, t)}` : t("notAvailable");
}

const rows = computed<ImageModelRow[]>(() =>
  props.models.map((entry) => ({
    label: entry.name,
    creatorName: entry.creatorName,
    rating: ratingText(entry, t),
    price: entry.pricePer1kImages != null ? `${formatDollar(entry.pricePer1kImages, t)}${t("per1kImages")}` : null,
  })),
);

function tooltipOf(row: ImageModelRow): string {
  return row.creatorName ? `${row.label} (${row.creatorName})` : row.label;
}
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex h-full flex-col">
      <CardHeader :title="t('textToImage')" :subtitle="t('artificialSource')" />
      <!-- Five 40px rows when filled: the same box here, so the card does not collapse and shift the grid. -->
      <EmptyState v-if="rows.length === 0" variant="plain" compact class="min-h-[200px]" :message="t('notAvailable')" />
      <!-- The same 40px row as the ranked lists: the height separates the rows, so no divider is drawn. The label slot
           carries the name and its figures, which is why this card's rows have no right-aligned value. -->
      <RankedListRows v-else :rows="rows">
        <template #label="{ row }">
          <div class="min-w-0 flex-1">
            <p class="ui-body break-words md:truncate" v-tooltip="tooltipOf(row)">
              {{ row.label }}
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
        </template>
        <template #value />
      </RankedListRows>
    </CardContent>
  </Card>
</template>
