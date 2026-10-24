import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";

export function useListKeyboard(
  itemCount: MaybeRefOrGetter<number>,
  onSelect: (index: number) => void,
  onClose?: () => void,
) {
  const index = ref(-1);
  const count = computed(() => toValue(itemCount));
  const activeIndex = computed(() => (index.value < 0 ? -1 : Math.min(index.value, count.value - 1)));

  // Results arrive from several model sources in waves, so the count changes while the panel is open. The clamp above
  // keeps the highlight inside the new range; resetting on every change dropped it mid-navigation, which left Enter
  // doing nothing at all. A new term resets the index explicitly (use-combobox's onChange/onFocus/onClear).

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
      index.value = (activeIndex.value + 1) % count.value;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      index.value = activeIndex.value <= 0 ? count.value - 1 : activeIndex.value - 1;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex.value >= 0) onSelect(activeIndex.value);
      index.value = -1;
    }
  }

  return { activeIndex, setActiveIndex, handleKeyDown };
}
