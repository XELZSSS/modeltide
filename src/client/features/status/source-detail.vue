<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { useSuspenseStatusHistory } from "@/client/api/api-queries";
import { unwrapObject } from "@/client/api/payload-normalize";
import { cn } from "@/client/utils/cn";
import { formatLatencySec, formatUptimePct } from "@/client/utils/format";
import { SOURCE_LABELS } from "@/shared/config";
import type { SourceId, StatusHistoryPayload } from "@/shared/types";
import { LEVEL_STYLES, resolveLevel } from "@/shared/utils/status-level";
import { EMPTY_BUCKETS, EMPTY_EVENTS, EMPTY_SAMPLES } from "@/client/utils/empty";
import { loadableView } from "@/client/router/lazy-view";
import PageContainer from "@/client/components/layout/page-container.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import SectionCard from "@/client/components/layout/section-card.vue";
import DetailPageLayout from "@/client/components/layout/detail-page-layout.vue";
import StatCard from "@/client/components/ui/stat-card.vue";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import ChartSkeleton from "@/client/components/ui/chart-skeleton.vue";
import { LATENCY_CHART_HEIGHT } from "@/client/utils/chart-metrics";
import UptimeStrip from "@/client/features/status/status-parts.vue";
import StatusEventList from "@/client/features/status/status-events.vue";

const LatencyChart = loadableView(() => import("@/client/features/status/latency-chart.vue"));

const props = defineProps<{ id: SourceId }>();

const { t } = useTranslation();
const query = await useSuspenseStatusHistory();

const history = computed(() => unwrapObject<StatusHistoryPayload>(query.data.value, "statusHistory"));
const summary = computed(() => history.value.sources.find((source) => source.id === props.id));
const recent = computed(() => history.value.recent[props.id] ?? EMPTY_SAMPLES);
const buckets = computed(() => history.value.daily[props.id] ?? EMPTY_BUCKETS);
const level = computed(() => resolveLevel(summary.value));
const detail = computed(() => summary.value?.detail ?? null);
const warn24h = computed(() => summary.value?.warn24h ?? 0);
</script>

<template>
  <PageContainer>
    <DetailPageLayout
      back-label-key="backToStatus"
      back-to="/status"
      :title="t(SOURCE_LABELS[id])"
      :description="t('statusPageTitle')"
    >
      <StatGrid :columns="4">
        <StatCard :label="t('statusCurrent')">{{ t(LEVEL_STYLES[level].labelKey) }}</StatCard>
        <StatCard :label="t('uptime24h')">{{ formatUptimePct(summary?.uptime24h ?? null, t) }}</StatCard>
        <StatCard :label="t('uptime7d')">{{ formatUptimePct(summary?.uptime7d ?? null, t) }}</StatCard>
        <StatCard :label="t('latencyAvg24h')">{{ formatLatencySec(summary?.avgLatency24h, t) }}</StatCard>
      </StatGrid>

      <p v-if="warn24h > 0" class="ui-caption text-warning">
        {{ t("warn24h") }}
        <span class="ui-mono-value text-xs ml-1.5">{{ formatUptimePct(warn24h, t) }}</span>
      </p>

      <p
        v-if="detail"
        :class="cn('ui-body-secondary break-words', level === 'error' ? 'text-destructive' : 'text-warning')"
      >
        {{ detail }}
      </p>

      <SectionCard :title="t('latencyHistory')">
        <Suspense v-if="recent.length > 1">
          <LatencyChart :samples="recent" />
          <template #fallback><ChartSkeleton :height="LATENCY_CHART_HEIGHT" /></template>
        </Suspense>
        <p v-else class="ui-body-secondary py-10 text-center">{{ t("historyAccumulating") }}</p>
      </SectionCard>

      <SectionCard :title="t('last30Days')">
        <UptimeStrip :buckets="buckets" />
      </SectionCard>

      <PageSection :title="t('recentEvents')">
        <StatusEventList
          :events="history.events ?? EMPTY_EVENTS"
          :source-id="id"
          :limit="10"
          :empty-message="t('noRecentEvents')"
        />
      </PageSection>
    </DetailPageLayout>
  </PageContainer>
</template>
