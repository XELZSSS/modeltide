<script setup lang="ts">
import { computed } from "vue";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import CardHeader from "@/client/components/layout/card-header.vue";
import { useTranslation } from "@/client/i18n";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import RankedListRows from "./ranked-list-rows.vue";
import type { CodingAgentEntry } from "@/shared/types";

interface AgentRow {
  /** The agent's name, which is what `RankedListRows` keys a row on. */
  label: string;
  /** The index, formatted — the row's right-aligned figure. */
  valueLabel: string;
  creatorName: string | null;
  /**
   * The model the agent scored highest on; `null` for a vendor-hosted agent that reports no single one, which the second
   * line prints as the not-available label so the row keeps its height instead of collapsing to one line.
   */
  model: string | null;
}

const props = defineProps<{ agents: CodingAgentEntry[] }>();

const { t } = useTranslation();

/** The card ranks agents, not models: the figure is the Coding Agent Index (AA's composite of FrontierCode, SWE-Atlas-QnA
 * and Terminal-Bench v4) at the whole-number precision the upstream prints, and the model is the second line. */
const rows = computed<AgentRow[]>(() =>
  props.agents.map((entry) => ({
    label: entry.agent,
    valueLabel: String(wholeIndex(entry.score)),
    creatorName: entry.creator,
    model: entry.model,
  })),
);

function tooltipOf(row: AgentRow): string {
  const model = row.model == null ? "" : ` — ${row.model}`;
  return `${row.label}${model} · ${t("codingAgentIndex")}: ${row.valueLabel}`;
}
/** The index at the precision AA prints it: a whole number. Two agents inside one whole number (`61.65` and `61.51`) print
 * the same figure — that is the upstream's own display precision, not a rounding choice this card can improve on. */
function wholeIndex(score: number): number {
  return Math.round(score);
}
</script>

<template>
  <Card class="h-full">
    <CardContent class="flex h-full flex-col">
      <CardHeader :title="t('codingAgents')" :subtitle="t('artificialSource')" />
      <!-- The same box whether or not the list is filled, so the card does not collapse and shift the grid. -->
      <EmptyState v-if="rows.length === 0" variant="plain" compact class="min-h-50" :message="t('notAvailable')" />
      <!-- The same row as the ranked lists: the height separates the rows, so no divider is drawn. The label slot
           carries the agent and the model it drove, which is why the caption is a second line and not a column. -->
      <RankedListRows v-else :rows="rows">
        <template #label="{ row }">
          <div class="min-w-0 flex-1">
            <p class="ui-body break-words md:truncate" v-tooltip="tooltipOf(row)">
              {{ row.label }}
              <span v-if="row.creatorName" class="ui-caption">({{ row.creatorName }})</span>
            </p>
            <p class="ui-caption break-words md:truncate">{{ row.model ?? t("notAvailable") }}</p>
          </div>
        </template>
      </RankedListRows>
    </CardContent>
  </Card>
</template>
