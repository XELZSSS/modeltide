<script lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  useId,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

export interface ComboboxOptions {
  initialValue: string;
  minQuery: number;
  itemCount: MaybeRefOrGetter<number>;
  isOpen: Ref<boolean>;
  isFocused: Ref<boolean>;
  onSelect: (index: number) => void;
}

export function useCombobox({ initialValue, minQuery, itemCount, isOpen, isFocused, onSelect }: ComboboxOptions) {
  const containerRef = ref<HTMLDivElement | null>(null);
  const inputRef = ref<HTMLInputElement | null>(null);
  const listRef = ref<HTMLDivElement | null>(null);
  const inputId = useId();
  const listboxId = useId();
  const statusId = useId();
  const { inputValue, debounced, setDebouncedDirect, composing } = useDebouncedTerm(initialValue, 200);
  const canSearch = computed(() => !composing.value && inputValue.value.trim().length >= minQuery);

  const select = (index: number) => {
    if (index < 0 || index >= toValue(itemCount)) return;
    setDebouncedDirect("");
    isOpen.value = false;
    onSelect(index);
  };

  const { activeIndex, setActiveIndex, handleKeyDown } = useListKeyboard(itemCount, select, () => {
    isOpen.value = false;
    inputRef.value?.focus();
  });

  useClickOutside(containerRef, () => {
    isOpen.value = false;
  });

  watch(
    [activeIndex, isOpen],
    () => {
      if (!isOpen.value || activeIndex.value < 0) return;
      listRef.value
        ?.querySelector(`#${CSS.escape(`${listboxId}-option-${activeIndex.value}`)}`)
        ?.scrollIntoView({ block: "nearest" });
    },
    { flush: "post" },
  );

  function onKeyDown(e: KeyboardEvent): void {
    if (e.isComposing || composing.value) return;
    if (!isOpen.value && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (canSearch.value) isOpen.value = true;
      return;
    }
    if (!isOpen.value) return;
    handleKeyDown(e);
  }

  function onChange(value: string | undefined): void {
    const next = value ?? "";
    inputValue.value = next;
    if (composing.value) {
      isOpen.value = false;
      return;
    }
    isOpen.value = next.trim().length >= minQuery;
    setActiveIndex(-1);
  }

  function onCompositionEnd(): void {
    composing.value = false;
    const value = inputRef.value?.value ?? "";
    if (value.trim().length >= minQuery) {
      isOpen.value = true;
      setActiveIndex(-1);
    }
  }

  function onFocus(): void {
    isFocused.value = true;
    if (canSearch.value) {
      isOpen.value = true;
      setActiveIndex(-1);
    }
  }

  function onClear(): void {
    setDebouncedDirect("");
    isOpen.value = false;
    setActiveIndex(-1);
    composing.value = false;
    inputRef.value?.focus();
  }

  return {
    containerRef,
    inputRef,
    listRef,
    inputId,
    listboxId,
    statusId,
    inputValue,
    debounced,
    canSearch,
    isOpen,
    activeIndex,
    onChange,
    onFocus,
    onBlur: () => {
      isFocused.value = false;
    },
    onKeyDown,
    onCompositionStart: () => {
      composing.value = true;
    },
    onCompositionEnd,
    onHover: setActiveIndex,
    onSelectIndex: select,
    onClear,
  };
}

export type ComboboxController = ReturnType<typeof useCombobox>;

function useDebouncedTerm(initial: string, delayMs = 200) {
  const inputValue = ref(initial);
  const debounced = ref(initial);
  const composing = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  watch(
    [inputValue, composing],
    () => {
      clearTimer();
      if (composing.value) return;
      timer = setTimeout(() => {
        timer = null;
        debounced.value = inputValue.value;
      }, delayMs);
    },
    { immediate: true },
  );

  onUnmounted(clearTimer);

  function setDebouncedDirect(v: string): void {
    clearTimer();
    debounced.value = v;
    inputValue.value = v;
  }

  return { inputValue, debounced, setDebouncedDirect, composing };
}

function useClickOutside(target: Ref<HTMLElement | null>, onOutside: () => void): void {
  function handle(e: Event): void {
    if (target.value && !target.value.contains(e.target as Node)) onOutside();
  }

  onMounted(() => {
    document.addEventListener("pointerdown", handle);
    document.addEventListener("focusin", handle);
  });

  onUnmounted(() => {
    document.removeEventListener("pointerdown", handle);
    document.removeEventListener("focusin", handle);
  });
}

function useListKeyboard(
  itemCount: MaybeRefOrGetter<number>,
  onSelect: (index: number) => void,
  onClose?: () => void,
) {
  const index = ref(-1);
  const count = computed(() => toValue(itemCount));
  const activeIndex = computed(() => (index.value < 0 ? -1 : Math.min(index.value, count.value - 1)));

  watch(count, () => {
    index.value = -1;
  });

  function setActiveIndex(value: number): void {
    index.value = value;
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      index.value = -1;
      onClose?.();
      return;
    }
    if (count.value === 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      index.value = (index.value + 1) % count.value;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      index.value = index.value <= 0 ? count.value - 1 : index.value - 1;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex.value >= 0) onSelect(activeIndex.value);
      index.value = -1;
    }
  }

  return { activeIndex, setActiveIndex, handleKeyDown };
}
</script>

<script setup lang="ts">
import { Search, X } from "@lucide/vue";
import { cn } from "@/client/utils/cn";
import Input from "@/client/components/ui/input.vue";
import { useTranslation } from "@/client/i18n";

const props = defineProps<{ controller: ComboboxController; status?: string; class?: string }>();

const { t } = useTranslation();

const {
  containerRef,
  inputRef,
  listRef,
  inputId,
  listboxId,
  statusId,
  inputValue,
  canSearch,
  isOpen,
  activeIndex,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onClear,
} = props.controller;

const classes = computed(() => cn("relative w-full sm:w-72 min-w-0 max-w-full", props.class));

const clearClasses = computed(() =>
  cn(
    "shrink-0 p-1 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
    !inputValue.value && "invisible pointer-events-none",
  ),
);

const inputInstance = ref<InstanceType<typeof Input> | null>(null);

watch(
  inputInstance,
  (instance) => {
    inputRef.value = instance?.el ?? null;
  },
  { immediate: true },
);

function setContainerEl(el: unknown): void {
  containerRef.value = el instanceof HTMLDivElement ? el : null;
}

function setListEl(el: unknown): void {
  listRef.value = el instanceof HTMLDivElement ? el : null;
}
</script>

<template>
  <div :ref="setContainerEl" :class="classes">
    <label :for="inputId" class="sr-only">{{ t("searchPlaceholder") }}</label>
    <div
      class="flex h-9 items-center gap-2 min-w-0 max-w-full ui-card px-3 transition-colors duration-fast focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-ring/30"
    >
      <Search :size="16" class="text-text-secondary shrink-0" aria-hidden="true" />
      <Input
        ref="inputInstance"
        :id="inputId"
        type="text"
        :model-value="inputValue"
        role="combobox"
        :aria-expanded="isOpen"
        :aria-controls="isOpen ? listboxId : undefined"
        :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined"
        aria-autocomplete="list"
        :aria-describedby="statusId"
        autocomplete="off"
        :placeholder="t('searchPlaceholder')"
        class="flex-1 border-0 bg-transparent px-0 h-full focus:border-transparent focus:ring-0"
        @update:model-value="onChange"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeyDown"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
      />
      <button
        type="button"
        :aria-label="t('clear')"
        :aria-hidden="inputValue ? undefined : true"
        :tabindex="inputValue ? 0 : -1"
        :class="clearClasses"
        @click="onClear"
      >
        <X :size="14" class="text-text-secondary" />
      </button>
    </div>

    <div
      v-if="isOpen && canSearch"
      :id="listboxId"
      :ref="setListEl"
      role="listbox"
      class="absolute top-full left-0 right-0 sm:left-auto sm:right-0 sm:w-72 sm:max-w-[calc(100vw-2rem)] mt-1.5 max-h-[28rem] overflow-y-auto overscroll-contain no-scrollbar ui-overlay z-40 animate-enter"
    >
      <div class="p-1.5"><slot /></div>
    </div>
    <div :id="statusId" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ isOpen && canSearch ? status : "" }}
    </div>
  </div>
</template>
