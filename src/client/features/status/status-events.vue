<script setup lang="ts">
import { computed } from "vue";
import type { StatusEvent } from "@/shared/types";
import { cn } from "@/client/utils/cn";
import { formatRelativeTime } from "@/client/utils/format";
import { sourceLabel } from "@/shared/config";
import { useTranslation } from "@/client/i18n";
import Dot from "@/client/components/ui/dot.vue";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import { eventDurationLabel, resolveEventStyle } from "@/client/utils/status-events";
import { ROW_PADDING } from "@/client/config/layout";

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

// Precompute per-row view models instead of calling resolveEventStyle/detailOf
// three times per row inside the template.
const rows = computed(() =>
  visible.value.map((event) => ({
    event,
    style: resolveEventStyle(event.type),
    detail: detailOf(event),
  })),
);
</script>

<template>
  <EmptyState v-if="visible.length === 0" compact :message="emptyMessage" />
  <div v-else class="ui-card divide-y divide-border">
    <div
      v-for="row in rows"
      :key="`${row.event.id}-${row.event.at}-${row.event.type}`"
      :class="cn('flex items-start justify-between gap-3', ROW_PADDING)"
    >
      <div class="flex items-start gap-2 min-w-0">
        <Dot size="sm" :color="row.style.color" class="mt-1.5" />
        <div class="min-w-0">
          <div class="text-sm">
            <span :class="cn('font-medium', row.style.text)">{{ t(row.style.labelKey) }}</span>
            <template v-if="showSource">
              <span class="text-text-secondary mx-1.5">·</span>
              <span class="text-text-secondary">{{ sourceLabel(row.event.id, t) }}</span>
            </template>
          </div>
          <p
            v-if="row.detail"
            class="ui-caption text-text-secondary mt-0.5 line-clamp-2 break-words"
            :title="row.detail ?? undefined"
          >
            {{ row.detail }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0 text-xs text-text-secondary">
        <span v-if="row.event.type !== 'up'" class="font-mono">{{ eventDurationLabel(t, row.event.durationMin) }}</span>
        <span v-if="showTime">{{ formatRelativeTime(row.event.at, t, lang) }}</span>
      </div>
    </div>
  </div>
</template>
