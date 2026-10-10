import { onUnmounted, ref, watch } from "vue";

export function useDebouncedTerm(initial: string, delayMs = 200) {
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
