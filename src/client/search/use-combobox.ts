import { computed, ref, toValue, useId, watch, type MaybeRefOrGetter, type Ref } from "vue";
import { useClickOutside } from "./use-click-outside";
import { useDebouncedTerm } from "./use-debounced-term";
import { useListKeyboard } from "./use-list-keyboard";

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
      try {
        listRef.value
          ?.querySelector(`#${escapeSelectorId(`${listboxId}-option-${activeIndex.value}`)}`)
          ?.scrollIntoView({ block: "nearest" });
      } catch {
        // selector edge-case: skip scroll, selection still works
      }
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

function escapeSelectorId(id: string): string {
  try {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(id);
  } catch {
    // fall through to manual escape
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
