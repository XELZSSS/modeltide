<script setup lang="ts">
import { computed } from "vue";
import SafeLink from "@/client/components/safe-link.vue";
import Dot from "@/client/components/ui/dot.vue";
import { useTranslation } from "@/client/i18n";
import { useSuspenseStatusHistory } from "@/client/api/api-queries";
import { unwrapObject } from "@/client/api/payload-normalize";
import { eventDurationLabel, resolveEventStyle } from "@/client/utils/status-events";
import { sourceLabel } from "@/shared/config";
import type { StatusEvent, StatusHistoryPayload } from "@/shared/types";
import { resolveLevel } from "@/shared/utils/status-level";
import { LEVEL_STYLES } from "@/client/utils/status-theme";

const EVENT_LINK_CLASS =
  "flex h-9 items-center gap-2 min-w-0 w-full ui-card px-3.5 transition-colors duration-fast hoverable:hover:border-text-tertiary/40 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

interface EventSegment {
  key: string;
  className: string;
  text: string;
  title?: string;
}

const { t } = useTranslation();
const query = await useSuspenseStatusHistory();

const history = computed(() => unwrapObject<StatusHistoryPayload>(query.data.value, "statusHistory"));

const vm = computed(() => {
  const payload = history.value;
  // Single pass for the latest event instead of copy + O(n log n) sort.
  const event = (payload.events ?? []).reduce<StatusEvent | null>(
    (latest, e) => (latest == null || e.at > latest.at ? e : latest),
    null,
  );
  if (!event) return null;
  const summary = payload.sources.find((s) => s.id === event.id);
  const samples = payload.recent?.[event.id] ?? [];
  const lastSample = samples.length > 0 ? samples.reduce((a, b) => (b.t > a.t ? b : a)) : undefined;
  const level = resolveLevel(summary);
  const eventStyle = resolveEventStyle(event.type);
  const errorText = lastSample?.error ?? null;
  const statusCode = lastSample?.status ?? null;
  const detailText = errorText ?? (statusCode != null && level === "error" ? `HTTP ${statusCode}` : null);
  const meta: EventSegment[] = [
    { key: "event", className: `font-medium ${eventStyle.text}`, text: t(eventStyle.labelKey) },
    { key: "source", className: "text-text-secondary", text: sourceLabel(event.id, t) },
    { key: "level", className: `font-medium ${LEVEL_STYLES[level].text}`, text: t(LEVEL_STYLES[level].labelKey) },
    ...(detailText
      ? [{ key: "detail", className: "text-text-tertiary font-mono", title: detailText, text: detailText }]
      : []),
  ];
  return {
    event,
    eventStyle,
    meta,
    durationLabel: eventDurationLabel(t, event.durationMin),
  };
});
</script>

<template>
  <SafeLink v-if="!vm" href="/status" :class="EVENT_LINK_CLASS">
    <span class="ui-body-secondary truncate">{{ t("noRecentEvents") }}</span>
  </SafeLink>
  <SafeLink v-else href="/status" :class="`${EVENT_LINK_CLASS} overflow-hidden`">
    <Dot size="sm" :color="vm.eventStyle.color" />
    <span class="ui-body truncate min-w-0 flex-1 whitespace-nowrap">
      <template v-for="(seg, i) in vm.meta" :key="seg.key">
        <span v-if="i > 0" class="text-text-secondary mx-1.5">·</span>
        <span :class="seg.className" :title="seg.title">{{ seg.text }}</span>
      </template>
    </span>
    <span class="flex items-center gap-2 text-xs text-text-secondary shrink-0">
      <span v-if="vm.event.type !== 'up'" class="font-mono whitespace-nowrap">{{ vm.durationLabel }}</span>
    </span>
  </SafeLink>
</template>
