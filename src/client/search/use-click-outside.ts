import { onMounted, onUnmounted, type Ref } from "vue";

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
