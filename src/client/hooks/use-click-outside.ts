import { onMounted, onUnmounted, type Ref } from "vue";

/** Calls `onOutside` when a pointer press or a focus move lands outside `target`: the shared piece behind every popover
 * that closes when the reader goes elsewhere (the search panels, the bar's language menu). */
export function useClickOutside(target: Ref<HTMLElement | null>, onOutside: () => void): void {
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
