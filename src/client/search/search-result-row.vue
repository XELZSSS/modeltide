<script setup lang="ts">
/** One row of the search panel: the model's name, its score where the source has one, the source it came from and the
 * provider. Shared by the page search and the navigation search, so the two panels cannot drift apart in what they show
 * or in how they respond to the pointer and the keyboard. */
import { useTranslation } from "@/client/i18n";
import { cn } from "@/client/utils/cn";
import { formatScore } from "@/shared/utils";
import type { SearchResult } from "./types";

defineProps<{ result: SearchResult; active: boolean; optionId: string }>();
defineEmits<{ select: []; hover: [] }>();

const { t } = useTranslation();
</script>

<template>
  <div
    :id="optionId"
    role="option"
    :aria-selected="active"
    :class="
      cn(
        'w-full cursor-pointer rounded-md p-2.5 text-left ui-motion',
        active ? 'bg-surface-hover' : 'hoverable:hover:bg-surface-hover',
      )
    "
    @mouseenter="$emit('hover')"
    @mousedown.prevent
    @click="$emit('select')"
  >
    <span class="flex items-center justify-between gap-2">
      <span class="truncate ui-body font-medium" v-tooltip="result.name">{{ result.name }}</span>
      <span
        v-if="typeof result.score === 'number' && Number.isFinite(result.score)"
        class="ml-2 shrink-0 font-mono ui-caption tabular-nums"
        v-tooltip="result.scoreLabel ? t(result.scoreLabel) : undefined"
      >
        {{ formatScore(result.score, t) }}
      </span>
    </span>
    <span class="mt-1 flex min-w-0 items-center gap-2">
      <span class="shrink-0 ui-caption">{{ t(result.source) }}</span>
      <span v-if="result.provider" class="min-w-0 truncate ui-meta">{{ result.provider }}</span>
    </span>
  </div>
</template>
