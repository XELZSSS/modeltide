<script setup lang="ts">
import { computed } from "vue";
import type { StatusEvent } from "@/shared/types";
import { cn } from "@/client/utils/cn";
import { formatRelativeTime } from "@/client/utils/format";
import { sourceLabel } from "@/shared/config";
import { useTranslation } from "@/client/i18n";
import Dot from "@/client/components/ui/dot.vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { eventDurationLabel, resolveEventStyle } from "@/client/features/status/status-events";

const props = withDefaults(
  defineProps<{
    events: StatusEvent[];
    emptyMessage: string;
    sourceId?: string;
    limit?: number;
    showSource?: boolean;
    showTime?: boolean;
  }>(),
  { showSource: false, showTime: false },
);

const { t, lang } = useTranslation();

const visible = computed(() => {
  const filtered = props.sourceId ? props.events.filter((event) => event.id === props.sourceId) : props.events;
  return props.limit == null ? filtered : filtered.slice(0, props.limit);
});

function detailOf(event: StatusEvent): string | null {
  return event.type === "up" ? null : (event.detail ?? null);
}
</script>

<template>
  <EmptyState v-if="visible.length === 0" compact :message="emptyMessage" />
  <div v-else class="ui-card divide-y divide-border">
    <div
      v-for="event in visible"
      :key="`${event.id}-${event.at}-${event.type}`"
      class="flex items-start justify-between gap-3 px-4 py-3"
    >
      <div class="flex items-start gap-2 min-w-0">
        <Dot size="sm" :color="resolveEventStyle(event.type).color" class="mt-1.5" />
        <div class="min-w-0">
          <div class="text-sm">
            <span :class="cn('font-medium', resolveEventStyle(event.type).text)">{{ t(resolveEventStyle(event.type).labelKey) }}</span>
            <template v-if="showSource">
              <span class="text-text-secondary mx-1.5">·</span>
              <span class="text-text-secondary">{{ sourceLabel(event.id, t) }}</span>
            </template>
          </div>
          <p
            v-if="detailOf(event)"
            class="ui-caption text-text-secondary mt-0.5 line-clamp-2 break-words"
            :title="detailOf(event) ?? undefined"
          >
            {{ detailOf(event) }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0 text-xs text-text-secondary">
        <span v-if="event.type !== 'up'" class="font-mono">{{ eventDurationLabel(t, event.durationMin) }}</span>
        <span v-if="showTime">{{ formatRelativeTime(event.at, t, lang) }}</span>
      </div>
    </div>
  </div>
</template>
