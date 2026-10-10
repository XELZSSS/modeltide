<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { useSuspenseStatusHistory } from "@/client/api/api-queries";
import { unwrapObject } from "@/client/api/payload-normalize";
import { cn } from "@/client/utils/cn";
import { formatUptime } from "@/client/utils/format";
import { sourceLabel } from "@/shared/config";
import type { SourceHistorySummary, StatusHistoryPayload } from "@/shared/types";
import { resolveLevel } from "@/shared/utils/status-level";
import { LEVEL_STYLES } from "@/client/utils/status-theme";
import { EMPTY_EVENTS, EMPTY_SOURCES } from "@/client/utils/empty";
import SafeLink from "@/client/components/safe-link.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import Dot from "@/client/components/ui/dot.vue";
import LabeledDot from "@/client/components/ui/labeled-dot.vue";
import StatusEventList from "@/client/features/status/status-events.vue";

interface SourceCard {
  id: string;
  label: string;
  level: ReturnType<typeof resolveLevel>;
  style: (typeof LEVEL_STYLES)[keyof typeof LEVEL_STYLES];
  detail: string | null;
}

const { t } = useTranslation();
const query = await useSuspenseStatusHistory();

const history = computed(() => unwrapObject<StatusHistoryPayload>(query.data.value, "statusHistory"));

const sources = computed(() => history.value.sources ?? EMPTY_SOURCES);

const cards = computed<SourceCard[]>(() =>
  sources.value.map((summary: SourceHistorySummary) => {
    const level = resolveLevel(summary);
    return {
      id: summary.id,
      label: sourceLabel(summary.id, t),
      level,
      style: LEVEL_STYLES[level],
      detail: summary.detail,
    };
  }),
);

const counts = computed(() => {
  let erroring = 0;
  let warning = 0;
  let unprobed = 0;
  let hasData = false;
  // Single resolveLevel pass: derive from cards instead of re-traversing sources.
  for (const card of cards.value) {
    if (card.level === "error") erroring++;
    else if (card.level === "warn") warning++;
    else if (card.level === "unknown") unprobed++;
  }
  if (!hasData) {
    for (const source of sources.value) {
      if (source.checkedAt != null) {
        hasData = true;
        break;
      }
    }
  }
  return { erroring, warning, unprobed, hasData };
});

const overall = computed(() => {
  const { erroring, warning, unprobed, hasData } = counts.value;
  const total = sources.value.length;
  if (!hasData) return { color: "var(--text-tertiary)", message: t("historyAccumulating") };
  if (erroring > 0) return { color: "var(--destructive)", message: t("statusDegraded", { down: erroring, total }) };
  if (warning > 0) return { color: "var(--warning)", message: t("statusWarnBanner", { warn: warning, total }) };
  if (unprobed > 0)
    return { color: "var(--text-tertiary)", message: t("statusProbing", { probed: total - unprobed, total }) };
  return { color: "var(--success)", message: t("statusAllOk") };
});
</script>

<template>
  <Card>
    <CardContent class="flex items-center justify-between gap-3 flex-wrap py-4">
      <div class="flex items-center gap-3 min-w-0">
        <Dot size="md" :color="overall.color" />
        <p class="ui-body font-medium text-balance">{{ overall.message }}</p>
      </div>
      <span class="ui-caption shrink-0">
        {{ t("serviceUptime") }}
        <span class="ui-mono-value text-xs text-text-primary ml-1.5">{{ formatUptime(history.uptimeMs, t) }}</span>
      </span>
    </CardContent>
  </Card>

  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
    <SafeLink
      v-for="card in cards"
      :key="card.id"
      :href="`/status/${card.id}`"
      class="group block ui-card p-4 transition-colors duration-fast hoverable:hover:border-text-tertiary/40 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <div class="flex items-center justify-between gap-3">
        <LabeledDot size="sm" :color="card.style.dot" text-class="ui-body" class="flex-1" :title="card.label">
          {{ card.label }}
        </LabeledDot>
        <span :class="cn('ui-caption font-medium shrink-0', card.style.text)">{{ t(card.style.labelKey) }}</span>
      </div>
      <p
        v-if="card.detail"
        :class="
          cn('ui-caption mt-3 line-clamp-2 break-words', card.level === 'error' ? 'text-destructive' : 'text-warning')
        "
      >
        {{ card.detail }}
      </p>
    </SafeLink>
  </div>

  <PageSection v-if="counts.hasData" :title="t('recentEvents')">
    <StatusEventList
      :events="history.events ?? EMPTY_EVENTS"
      :limit="15"
      :empty-message="t('noRecentEvents')"
      show-source
    />
  </PageSection>
</template>
