<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import type { DayBucket } from "@/shared/types";
import { cn } from "@/client/utils/cn";
import { ONE_DAY } from "@/shared/config";
import { useTranslation } from "@/client/i18n";
import { DAY_BAR_CLASSES, dayBarLevel } from "@/client/utils/status-level";

const props = defineProps<{ buckets: DayBucket[] }>();

const { t } = useTranslation();

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

function titleFor(day: string): string {
  const bucket = byDay.value.get(day);
  const ratio = bucket && bucket.total > 0 ? bucket.ok / bucket.total : null;
  const pct = ratio == null ? null : Math.round(ratio * 1000) / 10;
  if (!bucket || pct == null) return `${day} · ${t("uptimeNoData")}`;
  const degraded = bucket.warn ?? 0;
  return [bucket.day, `${pct}% (${bucket.total})`, degraded > 0 ? t("dayDegraded", { count: degraded }) : null]
    .filter(Boolean)
    .join(" · ");
}
</script>

<template>
  <div class="flex items-end gap-0.5 h-7" role="img" :aria-label="t('last30Days')">
    <span
      v-for="day in days"
      :key="day"
      :class="cn('flex-1 h-full', DAY_BAR_CLASSES[dayBarLevel(byDay.get(day))])"
      :title="titleFor(day)"
    />
  </div>
</template>
