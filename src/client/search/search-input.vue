<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useTranslation } from "@/client/i18n";
import { useRouteSearchTerm } from "@/client/hooks/use-route-search-term";
import { navigate } from "@/client/router";
import { MIN_QUERY, useSearchAllRankings } from "./use-search";
import { errorTextOf } from "@/client/api/present/error-text";
import Combobox from "./combobox.vue";
import SearchResultRow from "./search-result-row.vue";
import { useCombobox } from "./use-combobox";

const { t } = useTranslation();
const isOpen = ref(false);
const isFocused = ref(false);

const { term: searchTerm, path: searchPath, setTerm: setSearchTerm } = useRouteSearchTerm();

const { results, isPending, error, partial } = useSearchAllRankings(searchTerm, {
  defer: computed(() => !isOpen.value),
  warm: isFocused,
});

const failure = computed(() => errorTextOf(error.value, t));

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
    <SearchResultRow
      v-for="(result, index) in results"
      :key="`${result.source}-${result.id}`"
      :result="result"
      :active="activeIndex === index"
      :option-id="`${listboxId}-option-${index}`"
      @hover="onHover(index)"
      @select="onSelectIndex(index)"
    />
  </Combobox>
</template>
