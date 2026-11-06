<script setup lang="ts">
import { computed } from "vue";
import { useSuspenseHomeDashboard } from "@/client/api/view-models";
import { useMalformedGuard } from "@/client/hooks/use-malformed-guard";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";
import CardHeader from "@/client/components/layout/card-header.vue";
import RankedListRows from "./ranked-list-rows.vue";
import SafeLink from "@/client/components/ui/safe-link.vue";
import { FOCUS_RING } from "@/client/components/ui/interactive-classes";
import { loadableView } from "@/client/router/lazy-view";
import { useTranslation } from "@/client/i18n";
import { rankingTabHref } from "@/client/nav/sources";
import { cn } from "@/client/utils/cn";
import { formatIndex, formatPercent, formatScore, formatShortNumber } from "@/shared/utils";
import { shortModelId } from "@/shared/utils/models";
import { localeOf } from "@/shared/config/ui";
import { useHomeStats } from "./use-home-stats";
import ProviderSpeedCard from "./provider-speed-card.vue";
import HallucinationCard from "./hallucination-card.vue";
import CodingAgentsSection from "./coding-agents-section.vue";

const IndexRankingChart = loadableView(() => import("./home-charts.vue"));
const OpenSourceCard = loadableView(() => import("./open-source-card.vue"));

const { t, lang } = useTranslation();

const { data: dashboardData, updatedAt } = await useSuspenseHomeDashboard();

useMalformedGuard(() => dashboardData.value.malformed, "homeDashboard");

const { trendingStats, hallucinationStats, providerStats, codingAgents } = useHomeStats(dashboardData, t);

const partial = computed(() => dashboardData.value.partial);

/** CursorBench's top rows as a list: the model is the label, its pass rate the figure. */
const codingRows = computed(() =>
  dashboardData.value.coding.map((point) => ({
    label: shortModelId(point.name) || point.id,
    valueLabel: formatPercent(point.score, t),
  })),
);

/** OpenRouter usage: the model is the label, the tokens it moved the figure. */
const usageRows = computed(() =>
  dashboardData.value.usage.map((point) => ({
    label: shortModelId(point.name) || point.id,
    valueLabel: formatShortNumber(point.totalTokens, t("notAvailable")),
  })),
);

/** The Decision Index: the model is the label, the composite the figure. */
const decisionRows = computed(() =>
  dashboardData.value.decision.map((point) => ({
    label: point.name,
    valueLabel: formatScore(point.index, t),
  })),
);

/**
 * The header's one status line: when the payload arrived and whether every upstream answered. A dashboard that
 * aggregates four sources owes the reader both — a number with no age and no health is a number you cannot trust.
 */
const statusLine = computed(() => {
  const clock = new Intl.DateTimeFormat(localeOf(lang.value), { hour: "2-digit", minute: "2-digit" });
  const health = partial.value ? t("dataPartial") : t("dataComplete");
  return `${t("lastUpdated")} ${clock.format(updatedAt.value)} · ${health}`;
});

/**
 * Six figures, one per row head on the page: the same numbers read once, above the detail. Every one is optional
 * because a payload leg can fail on its own — a missing top row prints "not available" and the card it belongs to says
 * the same thing. The set spans all four upstreams on purpose (AA twice, OpenRouter, Hugging Face, CursorBench), so the
 * strip is not four slices of the same source.
 */
const kpis = computed(() => {
  const index = dashboardData.value.intelligence[0];
  const accuracy = hallucinationStats.value[0];
  const provider = providerStats.value[0];
  const coding = dashboardData.value.coding[0];
  const usage = dashboardData.value.usage[0];
  const download = trendingStats.value[0];
  return [
    {
      label: t("intelligenceIndex"),
      value: index === undefined ? t("notAvailable") : formatIndex(index.score),
      detail: index === undefined ? "" : index.name,
    },
    {
      label: t("hallucinationStats"),
      value: accuracy === undefined ? t("notAvailable") : accuracy.valueLabel,
      detail: accuracy === undefined ? "" : accuracy.label,
    },
    {
      label: t("providerSpeed"),
      value: provider === undefined ? t("notAvailable") : `${formatIndex(provider.avgSpeed)} ${t("tokensPerSecond")}`,
      detail: provider === undefined ? "" : provider.name,
    },
    {
      label: t("cursorBenchRankings"),
      value: coding === undefined ? t("notAvailable") : formatPercent(coding.score, t),
      detail: coding === undefined ? "" : shortModelId(coding.name) || coding.id,
    },
    {
      label: t("usageRankings"),
      value: usage === undefined ? t("notAvailable") : formatShortNumber(usage.totalTokens, t("notAvailable")),
      detail: usage === undefined ? "" : shortModelId(usage.name) || usage.id,
    },
    {
      label: t("mostDownloaded"),
      value: download === undefined ? t("notAvailable") : download.valueLabel,
      detail: download === undefined ? "" : download.label,
    },
  ];
});

/** Where each card leads: the ranking tab that owns the full table behind it. */
const TAB_HREFS = {
  intelligence: rankingTabHref("modelRankings"),
  openSource: rankingTabHref("openSourceRankings"),
  providers: rankingTabHref("providerCompare"),
  accuracy: rankingTabHref("hallucinationRankings"),
  codingAgents: rankingTabHref("codingAgentRankings"),
  cursorBench: rankingTabHref("cursorBenchRankings"),
  usage: rankingTabHref("openRouterRankings"),
  decision: rankingTabHref("decisionRankings"),
} as const;

/** The whole card is the link, so the page carries no repeated "see more" wording. */
const CARD_LINK = cn("block h-full rounded-xl", FOCUS_RING);
</script>

<template>
  <PartialNotice v-if="partial" />

  <header>
    <h1 class="ui-page-title">{{ t("homeTitle") }}</h1>
    <p class="mt-1.5 ui-caption">{{ statusLine }}</p>
  </header>

  <!--
    Six cells: the figure gets a line of its own. Sharing a baseline with a model name made the number the first thing
    flex could squeeze, and `ui-metric` carries `overflow-wrap: anywhere`, so a value like `0.68` broke in half inside a
    narrow cell. The name sits under it, truncated to the cell and never able to push the figure.
  -->
  <dl class="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-b border-border pb-5 md:grid-cols-3 lg:grid-cols-6">
    <div v-for="kpi in kpis" :key="kpi.label" class="flex min-w-0 flex-col">
      <dt class="ui-meta">{{ kpi.label }}</dt>
      <dd class="mt-1 ui-metric whitespace-nowrap">{{ kpi.value }}</dd>
      <dd class="mt-0.5 min-w-0 truncate ui-caption" :title="kpi.detail">{{ kpi.detail }}</dd>
    </div>
  </dl>

  <div class="mt-8 grid grid-cols-1 items-stretch gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12">
    <div class="md:col-span-2 lg:col-span-12">
      <SafeLink :href="TAB_HREFS.intelligence" :class="CARD_LINK">
        <IndexRankingChart :models="dashboardData.intelligence" />
      </SafeLink>
    </div>
    <div class="lg:col-span-6">
      <SafeLink :href="TAB_HREFS.openSource" :class="CARD_LINK">
        <OpenSourceCard :tasks="dashboardData.openSourceTasks" :trending="trendingStats" />
      </SafeLink>
    </div>
    <div class="lg:col-span-6">
      <SafeLink :href="TAB_HREFS.providers" :class="CARD_LINK">
        <ProviderSpeedCard :provider-stats="providerStats" />
      </SafeLink>
    </div>
    <div class="lg:col-span-6">
      <SafeLink :href="TAB_HREFS.accuracy" :class="CARD_LINK">
        <HallucinationCard :rows="hallucinationStats" />
      </SafeLink>
    </div>
    <div class="lg:col-span-6">
      <SafeLink :href="TAB_HREFS.codingAgents" :class="CARD_LINK">
        <CodingAgentsSection :agents="codingAgents" />
      </SafeLink>
    </div>
    <div class="lg:col-span-6">
      <SafeLink :href="TAB_HREFS.usage" :class="CARD_LINK">
        <Card class="h-full">
          <CardContent class="flex h-full flex-col">
            <CardHeader :title="t('usageRankings')" :subtitle="t('openRouterSource')" />
            <RankedListRows :rows="usageRows" />
          </CardContent>
        </Card>
      </SafeLink>
    </div>
    <div class="lg:col-span-6">
      <SafeLink :href="TAB_HREFS.decision" :class="CARD_LINK">
        <Card class="h-full">
          <CardContent class="flex h-full flex-col">
            <CardHeader :title="t('decisionIndex')" :subtitle="t('decisionSource')" />
            <RankedListRows :rows="decisionRows" />
          </CardContent>
        </Card>
      </SafeLink>
    </div>
    <div class="md:col-span-2 lg:col-span-12">
      <SafeLink :href="TAB_HREFS.cursorBench" :class="CARD_LINK">
        <Card class="h-full">
          <CardContent class="flex h-full flex-col">
            <CardHeader :title="t('codeIndex')" :subtitle="t('cursorBenchSource')" />
            <RankedListRows :rows="codingRows" />
          </CardContent>
        </Card>
      </SafeLink>
    </div>
  </div>
</template>
