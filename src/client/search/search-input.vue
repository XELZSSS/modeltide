<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";
import { useRouteSearchTerm } from "@/client/hooks/use-route-search-term";
import { navigate } from "@/client/router";
import { MIN_QUERY, useSearchAllRankings } from "./use-search";
import Combobox from "./combobox.vue";
import { useCombobox } from "./use-combobox";

const props = defineProps<{ class?: string }>();

const { t } = useTranslation();
const isOpen = ref(false);
const isFocused = ref(false);

const { term: searchTerm, setTerm: setSearchTerm } = useRouteSearchTerm();

const { results, isPending, isError, partial } = useSearchAllRankings(searchTerm, {
  defer: computed(() => !isOpen.value),
  warm: isFocused,
});

const combobox = useCombobox({
  initialValue: searchTerm.value,
  externalValue: searchTerm,
  minQuery: MIN_QUERY,
  itemCount: computed(() => results.value.length),
  isOpen,
  isFocused,
  onSelect: (index) => {
    const result = results.value[index];
    if (result) navigate(result.link);
  },
});

const { listboxId, activeIndex, inputValue, debounced, onHover, onSelectIndex } = combobox;

watch([debounced, searchTerm], () => {
  if (debounced.value !== searchTerm.value) setSearchTerm(debounced.value);
});

watch(searchTerm, (next) => {
  if (next !== debounced.value && next !== inputValue.value && document.activeElement?.tagName !== "INPUT") {
    inputValue.value = next;
  }
});

const pending = computed(() => isPending.value || inputValue.value !== searchTerm.value);
</script>

<template>
  <Combobox
    :controller="combobox"
    :class="props.class"
    :status="pending ? undefined : t('searchResultsCount', { count: results.length })"
  >
    <template #status>
      <div v-if="pending && results.length === 0" class="p-4 text-center ui-body-secondary" role="status">
        {{ t("searching") }}
      </div>
      <div v-else-if="isError && results.length === 0" class="p-4 ui-body-secondary" role="alert">
        {{ t("searchFailed") }}
      </div>
      <div v-else-if="results.length === 0" class="p-4 ui-body-secondary" role="status">
        {{ t("noResults") }}
      </div>
      <div v-else-if="partial" class="px-3 pt-2 ui-meta" role="status">
        {{ t("partialDataNotice") }}
      </div>
    </template>
    <div
      v-for="(result, index) in results"
      :id="`${listboxId}-option-${index}`"
      :key="`${result.source}-${result.id}`"
      role="option"
      :aria-selected="activeIndex === index"
      :class="
        cn(
          'w-full cursor-pointer rounded-md p-2.5 text-left ui-motion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          activeIndex === index ? 'bg-surface-hover' : 'hoverable:hover:bg-surface-hover',
        )
      "
      @mouseenter="onHover(index)"
      @mousedown.prevent
      @click="onSelectIndex(index)"
    >
      <span class="flex items-center justify-between gap-2">
        <span class="truncate ui-body font-medium" v-tooltip="result.name">{{ result.name }}</span>
        <span
          v-if="typeof result.score === 'number' && Number.isFinite(result.score)"
          class="ml-2 shrink-0 font-mono ui-caption tabular-nums"
          v-tooltip="result.scoreLabel ? t(result.scoreLabel) : undefined"
        >
          {{ result.score.toFixed(1) }}
        </span>
      </span>
      <span class="mt-1 flex items-center gap-2">
        <span class="ui-caption">{{ t(result.source) }}</span>
        <span v-if="result.provider" class="ui-meta">{{ result.provider }}</span>
      </span>
    </div>
  </Combobox>
</template>
