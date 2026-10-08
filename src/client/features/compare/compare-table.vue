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
import { seriesColor, useChartTheme } from "@/client/theme/chart-theme";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import Dot from "@/client/components/ui/dot.vue";
import { modelDisplayName } from "@/shared/utils/models";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { computeWinners, modelKeyOf, rowKey, type CompareRow } from "@/client/utils/compare-logic";
import { ROW_PADDING } from "@/client/config/layout";
import { RenderView } from "@/client/components/data/table/cell-view";

const props = defineProps<{
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
        <p class="flex items-center gap-2 text-sm font-medium truncate" :style="{ color: seriesColor(theme, index) }" :title="modelDisplayName(model)">
          <Dot size="sm" :color="seriesColor(theme, index)" />
          {{ modelDisplayName(model) }}
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
  <Card v-else>
    <CardContent>
      <div class="min-w-0 w-full overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border">
              <th
                scope="col"
                :class="
                  cn(
                    ROW_PADDING,
                    'text-xs font-medium text-text-tertiary',
                    'text-left',
                    'font-semibold text-text-secondary sticky left-0 z-10 bg-bg-card',
                  )
                "
              >
                {{ t("metric") }}
              </th>
              <th
                v-for="(model, index) in models"
                :key="modelKeyOf(model, index)"
                scope="col"
                :class="cn(ROW_PADDING, 'text-xs font-medium text-text-tertiary', 'text-right', 'font-semibold')"
                :style="{ color: seriesColor(theme, index) }"
                :title="modelDisplayName(model)"
              >
                {{ modelDisplayName(model) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="rowKey(row)" class="border-b border-border last:border-b-0">
              <th
                scope="row"
                :class="
                  cn(
                    ROW_PADDING,
                    'text-xs font-medium text-text-tertiary',
                    'text-left',
                    'text-text-secondary sticky left-0 bg-bg-card z-10',
                  )
                "
              >
                {{ row.label }}
              </th>
              <td
                v-for="(model, index) in models"
                :key="modelKeyOf(model, index)"
                :class="cn(ROW_PADDING, 'text-sm', 'text-right')"
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
