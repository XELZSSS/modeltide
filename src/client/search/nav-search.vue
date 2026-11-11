<script setup lang="ts">
/** The navigation's search: a panel under its trigger, not a field that takes the trigger's place — a field swapped into
 * the bar would reflow everything to its right. The term lives here instead of in the route, since `?q=` on whatever
 * page the reader is on would filter that page under them. `⌘K` / `Ctrl+K` opens it, `Esc` and a click outside close. */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { Search } from "@lucide/vue";
import Input from "@/client/components/ui/input.vue";
import { ICON_BUTTON } from "@/client/components/ui/interactive-classes";
import { useTranslation } from "@/client/i18n";
import { navigate } from "@/client/router";
import { errorTextOf } from "@/client/api/present/error-text";
import SearchResultRow from "./search-result-row.vue";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { useDebouncedTerm } from "./use-debounced-term";
import { useListKeyboard } from "./use-list-keyboard";
import { useSearchAllRankings } from "./use-search";

/** The bar exists from `md` up; below it the phone's "more" sheet carries the way into the search. */
const NAV_QUERY = "(min-width: 48rem)";

const { t } = useTranslation();
const open = ref(false);
const containerRef = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof Input> | null>(null);
const listboxId = useId();

const { inputValue, debounced, setDebouncedDirect, composing } = useDebouncedTerm("", 200);
const { results, isPending, error, partial } = useSearchAllRankings(debounced, {
  defer: computed(() => !open.value),
  warm: open,
});

const failure = computed(() => errorTextOf(error.value, t));

const { activeIndex, setActiveIndex, handleKeyDown } = useListKeyboard(
  computed(() => results.value.length),
  (index) => selectAt(index),
  () => close(),
);

/** One result, from the keyboard or from a click: navigate, then put the panel away. */
function selectAt(index: number): void {
  const result = results.value[index];
  if (result === undefined) return;
  navigate(result.link);
  close();
}

useClickOutside(containerRef, () => close());

function close(): void {
  open.value = false;
  setDebouncedDirect("");
  setActiveIndex(-1);
}

function toggle(): void {
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  nextTick(() => inputRef.value?.el?.focus());
}

function onChange(value: string): void {
  inputValue.value = value;
  setActiveIndex(-1);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing || composing.value) return;
  handleKeyDown(event);
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    if (!window.matchMedia(NAV_QUERY).matches) return;
    event.preventDefault();
    toggle();
  }
}

onMounted(() => window.addEventListener("keydown", onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKeydown));
</script>

<template>
  <div ref="containerRef" class="relative">
    <button
      type="button"
      v-tooltip="t('searchAction')"
      :class="ICON_BUTTON"
      :aria-expanded="open"
      :aria-label="t('searchAction')"
      @click="toggle"
    >
      <Search :size="16" aria-hidden="true" />
    </button>

    <Transition name="ui-pop">
      <div v-if="open" class="absolute top-full right-0 z-30 mt-1.5 w-[min(26rem,calc(100vw-2rem))]">
        <div class="ui-overlay p-2">
          <div
            class="flex h-9 items-center gap-2 rounded-md border border-border px-2 ui-motion focus-within:border-ring focus-within:ring-2 focus-within:ring-ring"
          >
            <Search :size="15" class="shrink-0 text-text-secondary" aria-hidden="true" />
            <Input
              ref="inputRef"
              type="text"
              role="combobox"
              :model-value="inputValue"
              :aria-expanded="open"
              :aria-controls="listboxId"
              :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined"
              aria-autocomplete="list"
              autocomplete="off"
              :aria-label="t('searchPlaceholder')"
              :placeholder="t('searchPlaceholder')"
              class="h-full flex-1 rounded-none border-0 bg-transparent px-0 focus:border-transparent focus-visible:bg-transparent focus-visible:ring-0 hoverable:hover:bg-transparent"
              @update:model-value="onChange"
              @keydown="onKeydown"
            />
            <kbd class="shrink-0 rounded-md border border-border px-1 font-mono ui-meta">esc</kbd>
          </div>

          <div :id="listboxId" role="listbox" class="mt-1.5 max-h-[24rem] overflow-y-auto overscroll-contain">
            <div v-if="isPending && results.length === 0" class="p-3 text-center ui-body-secondary" role="status">
              {{ t("searching") }}
            </div>
            <div v-else-if="failure && results.length === 0" class="p-3" role="alert">
              <p class="ui-body-secondary">{{ failure.title }}</p>
              <p class="mt-0.5 ui-meta">{{ failure.message }}</p>
            </div>
            <div v-else-if="results.length === 0" class="p-3 ui-body-secondary" role="status">
              {{ t("noResults") }}
            </div>
            <div v-else-if="partial" class="px-3 pt-1 pb-2 ui-meta" role="status">
              {{ t("partialDataNotice") }}
            </div>
            <SearchResultRow
              v-for="(result, index) in results"
              :key="`${result.source}-${result.id}`"
              :result="result"
              :active="activeIndex === index"
              :option-id="`${listboxId}-option-${index}`"
              @hover="setActiveIndex(index)"
              @select="selectAt(index)"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
