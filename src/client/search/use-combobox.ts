import { computed, onMounted, onUnmounted, ref, toValue, useId, watch, type MaybeRefOrGetter, type Ref } from "vue";

interface ComboboxOptions {
  initialValue: string;
  externalValue?: MaybeRefOrGetter<string>;
  minQuery: number;
  itemCount: MaybeRefOrGetter<number>;
  isOpen: Ref<boolean>;
  isFocused: Ref<boolean>;
  onSelect: (index: number) => void;
}

export function useCombobox({
  initialValue,
  externalValue,
  minQuery,
  itemCount,
  isOpen,
  isFocused,
  onSelect,
}: ComboboxOptions) {
  const containerRef = ref<HTMLDivElement | null>(null);
  const inputRef = ref<HTMLInputElement | null>(null);
  const listRef = ref<HTMLDivElement | null>(null);
  const inputId = useId();
  const listboxId = useId();
  const statusId = useId();
  const { inputValue, debounced, setDebouncedDirect, composing } = useDebouncedTerm(initialValue, 200);
  // Controlled mode: sync external term changes (e.g. history navigation) back into the input.
  if (externalValue !== undefined) {
    watch(
      () => toValue(externalValue),
      (next) => {
        if (typeof next === "string" && next !== debounced.value && next !== inputValue.value) {
          setDebouncedDirect(next);
        }
      },
    );
  }
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

function useListKeyboard(itemCount: MaybeRefOrGetter<number>, onSelect: (index: number) => void, onClose?: () => void) {
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
