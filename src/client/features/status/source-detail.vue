<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "@/client/i18n";
import { useSuspenseSourceIncidents, useSuspenseStatusHistory } from "@/client/api/api-queries";
import { unwrapObject } from "@/client/api/payload-normalize";
import { cn } from "@/client/utils/cn";
import { formatDate } from "@/client/utils/format";
import { SOURCE_LABELS } from "@/shared/config";
import type { SourceId, StatusHistoryPayload } from "@/shared/types";
import { resolveLevel } from "@/shared/utils/status-level";
import { LEVEL_STYLES } from "@/client/utils/status-theme";
import SafeLink from "@/client/components/safe-link.vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import DetailPageLayout from "@/client/components/layout/detail-page-layout.vue";
import PageSection from "@/client/components/layout/page-section.vue";
import StatCard from "@/client/components/ui/stat-card.vue";
import Dot from "@/client/components/ui/dot.vue";

const props = defineProps<{ id: SourceId }>();

const { t, lang } = useTranslation();
const statusQuery = await useSuspenseStatusHistory();
const incidentLog = await useSuspenseSourceIncidents(props.id);

const history = computed(() => unwrapObject<StatusHistoryPayload>(statusQuery.data.value, "statusHistory"));
const summary = computed(() => history.value.sources.find((source) => source.id === props.id));
const level = computed(() => resolveLevel(summary.value));
const detail = computed(() => summary.value?.detail ?? null);

const incidents = computed(() => incidentLog.value.incidents ?? []);
const pageUrl = computed(() => incidentLog.value.pageUrl);

function incidentColor(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "resolved" || normalized === "postmortem" || normalized === "completed") {
    return "var(--success)";
  }
  return "var(--warning)";
}

function incidentDate(iso: string | null): string | null {
  return iso ? formatDate(iso, lang.value) : null;
}
</script>

<template>
  <DetailPageLayout
    back-label-key="backToStatus"
    back-to="/status"
    :title="t(SOURCE_LABELS[id])"
    :description="t('statusPageTitle')"
  >
    <StatCard :label="t('statusCurrent')">{{ t(LEVEL_STYLES[level].labelKey) }}</StatCard>

    <p
      v-if="detail"
      :class="cn('ui-body-secondary break-words', level === 'error' ? 'text-destructive' : 'text-warning')"
    >
      {{ detail }}
    </p>
    <p v-else-if="!summary" class="ui-body-secondary text-text-secondary">{{ t("uptimeNoData") }}</p>

    <PageSection :title="t('incidentLog')">
      <EmptyState v-if="incidents.length === 0" compact :message="t('noIncidentLog')" />
      <div v-else class="flex flex-col gap-3">
        <article v-for="incident in incidents" :key="incident.id" class="ui-card p-4">
          <div class="flex items-start gap-2 min-w-0">
            <Dot size="sm" :color="incidentColor(incident.status)" class="mt-1.5 shrink-0" />
            <div class="min-w-0 flex-1">
              <h3 class="ui-body font-medium text-balance">{{ incident.name }}</h3>
              <p class="ui-caption text-text-secondary mt-1">
                <span class="capitalize">{{ incident.status }}</span>
                <template v-if="incident.impact"> · {{ incident.impact }}</template>
                <template v-if="incidentDate(incident.createdAt)"> · {{ incidentDate(incident.createdAt) }}</template>
              </p>
            </div>
          </div>
          <div v-if="incident.updates.length > 0" class="mt-3 flex flex-col gap-3 border-t border-border pt-3">
            <div v-for="(update, index) in incident.updates" :key="`${incident.id}-${index}`" class="min-w-0">
              <p class="ui-caption font-medium">
                <span class="capitalize" :style="{ color: incidentColor(update.status) }">{{ update.status }}</span>
                <span v-if="incidentDate(update.createdAt)" class="text-text-tertiary font-normal">
                  · {{ incidentDate(update.createdAt) }}
                </span>
              </p>
              <p class="ui-body-secondary mt-1 whitespace-pre-line break-words">{{ update.body }}</p>
            </div>
          </div>
        </article>
      </div>
      <SafeLink
        v-if="pageUrl"
        :href="pageUrl"
        target="_blank"
        rel="noopener"
        class="ui-caption text-text-secondary mt-3 inline-block hoverable:hover:text-text-primary"
      >
        {{ t("viewOfficialStatus") }} →
      </SafeLink>
    </PageSection>
  </DetailPageLayout>
</template>
