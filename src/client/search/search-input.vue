<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";
import { formatScore } from "@/shared/utils";
import { useRouteSearchTerm } from "@/client/hooks/use-route-search-term";
import { navigate } from "@/client/router";
import { MIN_QUERY, useSearchAllRankings } from "./use-search";
import { errorText } from "@/client/api/present/error-text";
import Combobox from "./combobox.vue";
import { useCombobox } from "./use-combobox";

const { t } = useTranslation();
const isOpen = ref(false);
const isFocused = ref(false);

const { term: searchTerm, path: searchPath, setTerm: setSearchTerm } = useRouteSearchTerm();

const { results, isPending, error, partial } = useSearchAllRankings(searchTerm, {
  defer: computed(() => !isOpen.value),
  warm: isFocused,
});

const failure = computed(() => (error.value === null ? null : errorText(error.value, t)));

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

// The route this term was typed on. The write-back happens one debounce later, and a navigation in between must not file
// the term under the page the reader has just moved to — that page would then be filtered by a search it never ran.
const typedOn = ref(searchPath.value);
watch(inputValue, () => {
  typedOn.value = searchPath.value;
});

watch([debounced, searchTerm], () => {
  if (debounced.value !== searchTerm.value) setSearchTerm(debounced.value, typedOn.value);
});

watch(searchTerm, (next) => {
  if (next !== debounced.value && next !== inputValue.value && document.activeElement?.tagName !== "INPUT") {
    inputValue.value = next;
  }
});

const pending = computed(() => isPending.value || inputValue.value !== searchTerm.value);
</script>

<template>
  <Combobox :controller="combobox" :status="pending ? undefined : t('searchResultsCount', { count: results.length })">
    <template #status>
      <div v-if="pending && results.length === 0" class="p-4 text-center ui-body-secondary" role="status">
        {{ t("searching") }}
      </div>
      <div v-else-if="failure && results.length === 0" class="p-4" role="alert">
        <p class="ui-body-secondary">{{ failure.title }}</p>
        <p class="mt-0.5 ui-meta">{{ failure.message }}</p>
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
          `w-full cursor-pointer rounded-md p-2.5 text-left ui-motion`,
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
          {{ formatScore(result.score, t) }}
        </span>
      </span>
      <span class="mt-1 flex min-w-0 items-center gap-2">
        <span class="shrink-0 ui-caption">{{ t(result.source) }}</span>
        <span v-if="result.provider" class="min-w-0 truncate ui-meta">{{ result.provider }}</span>
      </span>
    </div>
  </Combobox>
</template>
