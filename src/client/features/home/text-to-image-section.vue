<script setup lang="ts">
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import { useTranslation } from "@/client/i18n";
import { formatDollar } from "@/client/utils/format";
import type { TextToImageModel } from "@/shared/types";

defineProps<{ models: TextToImageModel[] }>();

const { t } = useTranslation();

function formatRatingInterval(entry: TextToImageModel): string {
  if (entry.eloUpper == null || entry.eloLower == null) return "";
  return ` (${entry.eloLower.toFixed(0)}–${entry.eloUpper.toFixed(0)})`;
}

function ratingText(entry: TextToImageModel): string {
  return entry.elo != null ? `${entry.elo.toFixed(0)}${formatRatingInterval(entry)}` : t("notAvailable");
}
</script>

<template>
  <PageSection v-if="models.length > 0" :title="t('textToImage')" :description="t('artificialSource')">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Card v-for="entry in models" :key="entry.id">
        <CardContent class="flex flex-col gap-3 w-full">
          <div class="flex items-center gap-2 min-w-0">
            <span class="ui-card-title truncate">{{ entry.name }}</span>
            <span v-if="entry.creatorName" class="ui-caption truncate shrink-0">({{ entry.creatorName }})</span>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1.5 ui-caption">
            <span
              >{{ t("elo") }}: <strong class="text-text-primary font-semibold">{{ ratingText(entry) }}</strong></span
            >
            <span v-if="entry.pricePer1kImages != null"
              >{{ t("price") }}:
              <strong class="text-text-primary font-semibold"
                >{{ formatDollar(entry.pricePer1kImages, t) }}{{ t("per1kImages") }}</strong
              ></span
            >
          </div>
        </CardContent>
      </Card>
    </div>
  </PageSection>
</template>
