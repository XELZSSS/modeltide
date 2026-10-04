<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import type { DayBucket } from "@/shared/types";
import { cn } from "@/client/utils/cn";
import { ONE_DAY } from "@/shared/config";
import { useTranslation } from "@/client/i18n";
import { DAY_BAR_CLASSES, dayBarLevel } from "@/shared/utils/status-level";
import { formatDate } from "@/client/utils/format";

const props = defineProps<{ buckets: DayBucket[] }>();

const { t, lang } = useTranslation();

function getLast30Days(now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = 29; i >= 0; i--) {
    out.push(new Date(now - i * ONE_DAY).toISOString().slice(0, 10));
  }
  return out;
}

const byDay = computed(() => new Map(props.buckets.map((bucket) => [bucket.day, bucket])));

const dayKey = ref(Math.floor(Date.now() / ONE_DAY));
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  const msUntilNextDay = (dayKey.value + 1) * ONE_DAY - Date.now();
  timer = setTimeout(() => {
    dayKey.value = Math.floor(Date.now() / ONE_DAY);
    schedule();
  }, msUntilNextDay + 1000);
}

schedule();

onUnmounted(() => {
  if (timer !== null) clearTimeout(timer);
});

const days = computed(() => getLast30Days(dayKey.value * ONE_DAY));

// Precompute each day's level class and label instead of re-deriving them
// (Map lookup + level + formatDate) inside the template.
const dayCells = computed(() =>
  days.value.map((day) => {
    const bucket = byDay.value.get(day);
    const ratio = bucket && bucket.total > 0 ? bucket.ok / bucket.total : null;
    const pct = ratio == null ? null : Math.round(ratio * 1000) / 10;
    const label =
      !bucket || pct == null
        ? `${formatDate(day, lang.value)} · ${t("uptimeNoData")}`
        : [
            formatDate(bucket.day, lang.value),
            `${pct}% (${bucket.total})`,
            (bucket.warn ?? 0) > 0 ? t("dayDegraded", { count: bucket.warn ?? 0 }) : null,
          ]
            .filter(Boolean)
            .join(" · ");
    return { day, levelClass: DAY_BAR_CLASSES[dayBarLevel(bucket)], label };
  }),
);
</script>

<template>
  <div class="flex items-end gap-0.5 h-7" role="group" :aria-label="t('last30Days')">
    <span
      v-for="cell in dayCells"
      :key="cell.day"
      role="img"
      :aria-label="cell.label"
      :title="cell.label"
      :class="cn('flex-1 h-full', cell.levelClass)"
    />
  </div>
</template>
