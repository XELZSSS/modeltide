<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2 } from "@lucide/vue";
import { useRouter } from "vue-router";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";
import { useRouteSearchTerm } from "@/client/stores";
import { MIN_QUERY, useSearchAllRankings } from "@/client/search/use-search";
import Combobox, { useCombobox } from "@/client/search/combobox.vue";

const props = defineProps<{ class?: string }>();

const { t } = useTranslation();
const router = useRouter();
const isOpen = ref(false);
const isFocused = ref(false);

const { term: searchTerm, setTerm: setSearchTerm } = useRouteSearchTerm();

const { results, isPending, isError } = useSearchAllRankings(searchTerm, {
  suspended: computed(() => !isOpen.value),
  warm: isFocused,
});

const combobox = useCombobox({
  initialValue: searchTerm.value,
  minQuery: MIN_QUERY,
  itemCount: computed(() => results.value.length),
  isOpen,
  isFocused,
  onSelect: (index) => {
    const result = results.value[index];
    if (result) void router.push(result.link);
  },
});

const { listboxId, activeIndex, inputValue, debounced, onHover, onSelectIndex } = combobox;

watch([debounced, searchTerm], () => {
  if (debounced.value !== searchTerm.value) setSearchTerm(debounced.value);
});

const pending = computed(() => isPending.value || inputValue.value !== searchTerm.value);

function optionClass(index: number): string {
  return cn(
    "w-full text-left p-2.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
    activeIndex.value === index ? "bg-hover" : "hoverable:hover:bg-hover",
  );
}
</script>

<template>
  <Combobox
    :controller="combobox"
    :class="props.class"
    :status="pending ? undefined : t('searchResultsCount', { count: results.length })"
  >
    <div
      v-if="pending && results.length === 0"
      class="flex items-center justify-center gap-2 p-4 text-sm text-text-secondary"
    >
      <Loader2 class="size-4 animate-spin" aria-hidden="true" />
      {{ t("searching") }}
    </div>
    <div v-else-if="isError && results.length === 0" class="p-4 text-sm text-text-secondary" role="alert">
      {{ t("searchFailed") }}
    </div>
    <div v-else-if="results.length === 0" class="p-4 text-sm text-text-secondary" role="status">
      {{ t("noResults") }}
    </div>
    <template v-else>
      <div
        v-for="(result, index) in results"
        :id="`${listboxId}-option-${index}`"
        :key="`${result.source}-${result.id}-${index}`"
        role="option"
        :aria-selected="activeIndex === index"
        :class="optionClass(index)"
        @mouseenter="onHover(index)"
        @mousedown.prevent
        @click="onSelectIndex(index)"
      >
        <span class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-text-primary truncate">{{ result.name }}</span>
          <span
            v-if="typeof result.score === 'number' && Number.isFinite(result.score)"
            class="text-xs text-text-secondary ml-2 shrink-0 font-mono"
          >
            {{ result.score.toFixed(1) }}
          </span>
        </span>
        <span class="flex items-center gap-2 mt-1">
          <span class="text-xs text-text-secondary">{{ t(result.source) }}</span>
          <span v-if="result.provider" class="text-xs text-text-tertiary">{{ result.provider }}</span>
        </span>
      </div>
    </template>
  </Combobox>
</template>
