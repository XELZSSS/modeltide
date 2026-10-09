<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { useSuspenseStatusHistory } from "@/client/api/api-queries";
import { unwrapObject } from "@/client/api/payload-normalize";
import { cn } from "@/client/utils/cn";
import { formatUptimePct } from "@/client/utils/format";
import { SOURCE_LABELS } from "@/shared/config";
import type { SourceId, StatusHistoryPayload } from "@/shared/types";
import { resolveLevel } from "@/shared/utils/status-level";
import { LEVEL_STYLES } from "@/client/utils/status-theme";
import { EMPTY_BUCKETS, EMPTY_EVENTS } from "@/client/utils/empty";
import PageSection from "@/client/components/layout/page-section.vue";
import SectionCard from "@/client/components/layout/section-card.vue";
import DetailPageLayout from "@/client/components/layout/detail-page-layout.vue";
import StatCard from "@/client/components/ui/stat-card.vue";
import StatGrid from "@/client/components/ui/stat-grid.vue";
import UptimeStrip from "@/client/features/status/status-parts.vue";
import StatusEventList from "@/client/features/status/status-events.vue";

const props = defineProps<{ id: SourceId }>();

const { t } = useTranslation();
const query = await useSuspenseStatusHistory();

const history = computed(() => unwrapObject<StatusHistoryPayload>(query.data.value, "statusHistory"));
const summary = computed(() => history.value.sources.find((source) => source.id === props.id));
const buckets = computed(() => history.value.daily[props.id] ?? EMPTY_BUCKETS);
const level = computed(() => resolveLevel(summary.value));
const detail = computed(() => summary.value?.detail ?? null);
const warn24h = computed(() => summary.value?.warn24h ?? 0);
</script>

<template>
  <DetailPageLayout
    back-label-key="backToStatus"
    back-to="/status"
    :title="t(SOURCE_LABELS[id])"
    :description="t('statusPageTitle')"
  >
    <StatGrid :columns="2">
      <StatCard :label="t('statusCurrent')">{{ t(LEVEL_STYLES[level].labelKey) }}</StatCard>
      <StatCard :label="t('uptime24h')">{{ formatUptimePct(summary?.uptime24h ?? null, t) }}</StatCard>
      <StatCard :label="t('uptime7d')">{{ formatUptimePct(summary?.uptime7d ?? null, t) }}</StatCard>
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
</template>
