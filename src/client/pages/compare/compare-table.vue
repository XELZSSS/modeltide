<script lang="ts">
import { h, type FunctionalComponent } from "vue";
import { TrendingDown, TrendingUp } from "@lucide/vue";
import { cn } from "@/client/utils/cn";
import type { Winner } from "@/client/utils/compare-logic";

export const WinnerMark: FunctionalComponent = () =>
  h(TrendingUp, { size: 12, class: "inline ml-0.5 text-success", "aria-hidden": "true" });

export const WinnerValue: FunctionalComponent<{ value: string; winner: Winner | null }> = (props) =>
  h(
    "span",
    {
      class: cn(
        "font-mono tabular-nums",
        props.winner === "win" && "font-semibold text-success",
        props.winner === "loss" && "text-destructive",
      ),
    },
    [
      props.value,
      props.winner === "win" ? h(WinnerMark) : null,
      props.winner === "loss"
        ? h(TrendingDown, { size: 12, class: "inline ml-0.5 text-destructive", "aria-hidden": "true" })
        : null,
    ],
  );
</script>

<script setup lang="ts">
import { computed, type VNodeChild } from "vue";
import { useTranslation } from "@/client/i18n";
import { useDevice } from "@/client/device";
import { seriesColor, useChartTheme } from "@/client/charts/theme";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import Dot from "@/client/components/ui/dot.vue";
import CardHeader from "@/client/components/layout/card-header.vue";
import { modelDisplayName } from "@/shared/utils/models";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { computeWinners, modelKeyOf, rowKey, type CompareRow } from "@/client/utils/compare-logic";
import { RenderView } from "@/client/components/table/cell-view";
import { ROW_PADDING } from "@/client/nav/layout";

// The metric matrix uses the same 40px row as the data tables, so a metric row and a ranking row read at one density.
const CELL = ROW_PADDING;

const props = defineProps<{
  title?: string;
  rows: CompareRow<ArtificialAnalysisModel>[];
  models: ArtificialAnalysisModel[];
  renderValue: (
    row: CompareRow<ArtificialAnalysisModel>,
    model: ArtificialAnalysisModel,
    winner: Winner | null,
  ) => VNodeChild;
}>();

const { t } = useTranslation();
const theme = useChartTheme();
const isMobile = useDevice();

const winners = computed(() => computeWinners(props.rows, props.models, modelKeyOf));

function getWinner(
  row: CompareRow<ArtificialAnalysisModel>,
  model: ArtificialAnalysisModel,
  index: number,
): Winner | null {
  return winners.value.get(rowKey(row))?.get(modelKeyOf(model, index)) ?? null;
}
</script>

<template>
  <div v-if="isMobile" class="flex flex-col gap-3">
    <Card v-for="(model, index) in models" :key="modelKeyOf(model, index)">
      <CardContent compact class="flex flex-col gap-3">
        <p
          class="flex items-center gap-2 text-sm font-medium"
          :style="{ color: seriesColor(theme, index) }"
          v-tooltip="modelDisplayName(model)"
        >
          <Dot size="sm" :color="seriesColor(theme, index)" />
          <!-- `truncate` has to sit on the text itself: on this flex row it applied to a box whose only child is an
               anonymous flex item, where `text-overflow` never resolves, so a long name was cut mid-glyph with no
               ellipsis. -->
          <span class="min-w-0 truncate">{{ modelDisplayName(model) }}</span>
        </p>
        <div class="flex flex-col gap-2">
          <div v-for="row in rows" :key="rowKey(row)" class="flex items-center justify-between gap-3">
            <span class="ui-caption">{{ row.label }}</span>
            <RenderView :render="() => renderValue(row, model, getWinner(row, model, index))" />
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
  <!-- The card carries a real 1px hairline and the table fills it edge to edge (`!p-0` below), so the card has to clip
       what it holds: without this the table rules and its square corners painted straight into the card's own border.
       Every card in this app that holds flush content clips for the same reason (`table/mobile.vue`,
       `news-category-data.vue`, and `data-table.vue` through its own scroll container). -->
  <Card v-else class="overflow-hidden">
    <CardContent class="!p-0">
      <div v-if="title" class="px-4 pt-4"><CardHeader :title="title" class="mb-3" /></div>
      <div class="w-full min-w-0">
        <table class="w-full table-fixed text-sm">
          <thead>
            <tr class="border-b border-border">
              <th scope="col" :class="cn(CELL, 'sticky left-0 z-10 w-[42%] bg-bg-card text-left ui-table-header')">
                {{ t("metric") }}
              </th>
              <th
                v-for="(model, index) in models"
                :key="modelKeyOf(model, index)"
                scope="col"
                :class="cn(CELL, 'text-right ui-table-header')"
                :style="{ color: seriesColor(theme, index) }"
                v-tooltip="modelDisplayName(model)"
              >
                <span class="block truncate">{{ modelDisplayName(model) }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="rowKey(row)" class="border-b border-border last:border-b-0">
              <th
                scope="row"
                :class="cn(CELL, 'sticky left-0 z-10 bg-bg-card text-left text-xs font-medium text-text-secondary')"
              >
                {{ row.label }}
              </th>
              <td
                v-for="(model, index) in models"
                :key="modelKeyOf(model, index)"
                :class="cn(CELL, 'text-sm', 'text-right')"
              >
                <RenderView :render="() => renderValue(row, model, getWinner(row, model, index))" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
</template>
